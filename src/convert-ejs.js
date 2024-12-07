const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const i18next = require('i18next');

const viewsDir = path.resolve(__dirname, 'src/views');
const localesDir = path.resolve(__dirname, 'src/locales');
const outDir = path.resolve(__dirname, 'dist');

const localeFiles = fs.readdirSync(localesDir);

localeFiles.forEach((localeFile) => {
    const locale = path.basename(localeFile, '.json');
    const translations = JSON.parse(fs.readFileSync(path.join(localesDir, localeFile), 'utf8'));

    i18next.init({
        lng: locale,
        resources: {
            [locale]: {
                translation: translations,
            },
        },
    });

    fs.readdirSync(viewsDir).forEach((file) => {
        if (file.endsWith('.ejs')) {
            const template = fs.readFileSync(path.join(viewsDir, file), 'utf8');
            const rendered = ejs.render(template, { t: i18next.t.bind(i18next) });
            const outputFile = file.replace('.ejs', `.${locale}.html`);
            fs.writeFileSync(path.join(outDir, outputFile), rendered);
        }
    });
});