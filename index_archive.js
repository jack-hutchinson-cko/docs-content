// @ts-check

const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const path = require('path');
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');
const tables = turndownPluginGfm.tables;
const username = 'email'
const password = 'password';
const loginUrl = 'https://dash.readme.com/login';
const docsUrl = 'https://dash.readme.com/project/checkoutdocs-legacy/v1.9/docs/integration-options';

(async function() {
    await scrapeHTML();
    await transformHTML();
})().then(
    () => console.log('done'),
    err => console.error(err)
);

async function scrapeHTML() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(loginUrl);

    // LOGIN
    await page.evaluate(function({ username, password }) {
        document.querySelector('#email')['value'] = username;
        document.querySelector('#password')['value'] = password;
    }, { username, password });
    await page.click('.btn-primary');
    await page.waitForSelector('.btn-primary');
    
    // GO TO DOCS
    await page.goto(docsUrl);
    await page.waitForSelector('.title');

    // GET ALL LINKS
    // 13 -> 190
    const links = await page.evaluate(() => {
        const list = document.querySelectorAll('.sidebar-section .links .link');
        let arr = [];
        for (let item = 13; item < 191; item++) {
            if(!list[item].classList.contains('hidden')) {
                arr.push(list[item]['href']);
            }
        }
        return arr;
    })

    for(let href of links) {
        console.log(href)
        await page.goto(href);

        await page.waitForSelector('.content');
        const len = href.split('/');
        const title = len[len.length - 1];
        const html = await page.evaluate(() => {
            console.log(document.getElementsByClassName('content')[0].innerHTML)
            return document.getElementsByClassName('content')[0].innerHTML;  
        })
        const json = { title, html: String(html) };
        await fs.writeFile(`./scraped/${title}.json`, JSON.stringify(json), 'utf-8');
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
account: Archive
---
`;
        const md = metadata + '\n' + turndownService.turndown(data.html);

        const filepath = `./final/Archive/${data.title.replace(/\//g, '-')}/index.mdx`;
        await fs.mkdir(path.dirname(filepath), { recursive: true });
        await fs.writeFile(filepath, md, 'utf-8');
    }
}
