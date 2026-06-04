import { readFile, writeFile } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
const js = await readFile(new URL("./app.js", import.meta.url), "utf8");
const splash = await readFile(new URL("./splash.png", import.meta.url));
const splashDataUrl = `data:image/png;base64,${splash.toString("base64")}`;

const standalone = html
  .replace(/\s*<link rel="manifest" href="\.\/manifest\.json" \/>\n/, "")
  .replace(/\s*<link rel="icon" href="\.\/icon\.svg" \/>\n/, "")
  .replace(/\s*<link rel="apple-touch-icon" href="\.\/icon\.svg" \/>\n/, "")
  .replaceAll("./splash.png", splashDataUrl)
  .replace(
    /\s*<link rel="stylesheet" href="\.\/styles\.css\?v=\d+" \/>\n/,
    `\n    <style>\n${css.replaceAll("</style", "<\\/style")}\n    </style>\n`,
  )
  .replace(
    /\s*<script src="\.\/app\.js\?v=\d+"><\/script>\n/,
    `\n    <script>\n${js.replaceAll("</script", "<\\/script")}\n    </script>\n`,
  );

await writeFile(new URL("./신규회선체크.html", import.meta.url), standalone, "utf8");
