// @ts-check

const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const path = require('path');
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');
const tables = turndownPluginGfm.tables;
const username = '';
const password = '';
const loginUrl = 'https://docs.checkout.com/admin';
const docsUrl = 'https://docs.checkout.com/display/DOCS/Checkout.com';

(async function() {
    await scrapeHTML();
    await transformHTML();
})().then(
    () => console.log('done'),
    err => console.error(err)
);

async function scrapeHTML() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(loginUrl);

    // LOGIN
    await page.evaluate(function({ username, password }) {
        document.querySelector('#os_username')['value'] = username;
        document.querySelector('#os_password')['value'] = password;
    }, { username, password });
    await page.click('#loginButton');
    await page.waitForSelector('#password');
    await page.evaluate(function({ password }) {
        document.querySelector('#password')['value'] = password;
    }, { password });
    await page.click('#authenticateButton');
    
    // GO TO DOCS
    await page.goto(docsUrl);

    // OPEN ALL SUBMENUS -- to ensure all nested/lazy-loaded nav is loaded 
    while(true) {
        const count = await page.$$eval('.ia-secondary-container .plugin_pagetree_childtoggle.aui-iconfont-chevron-right', (toggles) => {
            for(const toggle of toggles) {
                toggle['click']();
            }
            
            return toggles.length;
        });

        if(count === 0) break;
    }

    // GET ALL LINKS
    const hrefs = await page.$$eval('.ia-secondary-container a', anchors => anchors.map(a => a['href']));
    const uniqueHrefs = new Set(hrefs);
    console.log({hrefs, uniqueHrefs})

    for(const href of uniqueHrefs) {
        await page.goto(href);

        const showAllBreadcrumbs = await page.waitForSelector('#breadcrumbs [title="Show all breadcrumbs"]', { timeout: 500 }).catch(() => undefined);
        await showAllBreadcrumbs?.click();
        await page.waitForSelector('#breadcrumbs [title="Show all breadcrumbs"].hidden-crumb', { timeout: 500 }).catch(() => undefined);

        const path = await page.$eval('#breadcrumbs', el => el['innerText'].replaceAll('\n ', '/'));
        const title = await page.$eval('#title-text', el => el['innerText']);
        const html = await page.$eval('#content', el => el.innerHTML);
        const json = { path, title, html };
        await fs.writeFile(`./scraped/${title.replace(/\//g, '-')}.json`, JSON.stringify(json), 'utf-8');
    }
}

async function transformHTML() {
    const filenames = await fs.readdir('./scraped');
    
    const turndownService = new TurndownService();
    turndownService.use([tables])

    for(const filename of filenames) {
        const json = await fs.readFile(`./scraped/${filename}`, 'utf-8');
        const data = JSON.parse(json);
        const metadata = `---
title: ${data.title}
account: ABC
---
`;
        const md = metadata + '\n' + turndownService.turndown(data.html);

        const filepath = `./final/${data.path}/${data.title.replace(/\//g, '-')}.mdx`;
        await fs.mkdir(path.dirname(filepath), { recursive: true });
        await fs.writeFile(filepath, md, 'utf-8');
    }
}
