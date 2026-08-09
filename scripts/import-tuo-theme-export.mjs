import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoot = "/Users/abobo/Desktop/tuo-7-theme-export/themes";
const targetRoot = path.join(root, ".themes");
const supported = new Set(["align-items","aspect-ratio","background-color","border","border-bottom","border-left","border-right","border-top","border-radius","box-sizing","color","display","float","font-family","font-size","font-style","font-weight","gap","height","justify-content","letter-spacing","line-height","margin","margin-bottom","margin-top","max-width","min-height","object-fit","opacity","overflow","padding","padding-bottom","padding-left","padding-right","padding-top","position","right","left","top","bottom","text-align","text-align-last","vertical-align","width","z-index","list-style","white-space"]);

const names = {
  "content-method": { id: "tuo-content-method", types: ["opinion-knowledge","tutorial","list-driven"], tones: ["structured","warm","methodical"], patterns: ["argument-evidence-conclusion","list-driven"] },
  "digital-efficiency": { id: "tuo-digital-efficiency", types: ["tutorial","opinion-knowledge"], tones: ["calm","structured","practical"], patterns: ["argument-evidence-conclusion","list-driven"] },
  "forest-order": { id: "tuo-forest-order", types: ["literary-prose","personal-essay"], tones: ["formal","calm","narrative"], patterns: ["narrative-reflection","experience-reflection-conclusion"] },
  "insight-logic": { id: "tuo-insight-logic", types: ["opinion-knowledge","tutorial"], tones: ["analytical","clear","structured"], patterns: ["argument-evidence-conclusion","list-driven"] },
  "magazine-cards": { id: "tuo-magazine-cards", types: ["personal-essay","literary-prose"], tones: ["editorial","warm","narrative"], patterns: ["narrative-reflection","experience-reflection-conclusion"] },
  "quiet-lifestyle": { id: "tuo-quiet-lifestyle", types: ["personal-essay","literary-prose","other"], tones: ["warm","narrative","calm","lifestyle"], patterns: ["narrative-reflection","experience-reflection-conclusion"] },
  "whitespace-narrative": { id: "tuo-whitespace-narrative", types: ["literary-prose","personal-essay"], tones: ["quiet","reflective","minimal"], patterns: ["narrative-reflection","fragmented-prose"] },
};
const ordered = ["masthead","heading","subheading","minor","lead","prose","focus","list","quote","callout","cta","image","ending"];
const sourceFiles = { masthead:"01-masthead", heading:"02-heading-h2", subheading:"03-subheading-h3", minor:"04-minor-heading-h4", lead:"05-lead", prose:"06-prose", focus:"07-focus-prose", quote:"10-quote", callout:"11-callout", cta:"12-cta", image:"13-image", ending:"15-ending" };

function cleanStyle(raw) {
  return Object.fromEntries(raw.split(";").map((entry) => entry.trim().split(/:(.+)/)).filter(([key, value]) => supported.has(key) && value).map(([key, value]) => [key, value.trim()]));
}
function safeHtml(html) {
  let role = 0; const styles = {};
  html = html.replace(/<(?:div|header|footer)\b/gu, "<section").replace(/<\/(?:div|header|footer)>/gu, "</section>").replace(/<cite\b/gu,"<span").replace(/<\/cite>/gu,"</span>").replace(/<hr\b[^>]*>/gu,"<span></span>");
  html = html.replace(/\sstyle="([^"]*)"/gu, (_all, raw) => { const id = `r${role++}`; styles[id] = cleanStyle(raw); return ` data-style-role="${id}"`; });
  html = html.replace(/\saria-hidden="true"/gu, " data-decorative");
  html = html.replace(/<([a-z][a-z0-9-]*)(\b[^>]*)>/iu, "<$1 data-component-root$2>");
  return { html, styles };
}
function replaceText(html, from, slot) { return html.replace(from, `<slot name="${slot}"></slot>`); }
function definition(id, kind, blockTypes, slots, fallbackVariant, styles, template, variants = []) {
  return JSON.stringify({ specVersion:"1.0", id, template:"template.html", kind, accepts:{ blockTypes, ...(optionsLevel[id] ? { levels:[optionsLevel[id]] } : {}) }, slots, fallbackVariant, baseStyles:styles, variants:[{ id:fallbackVariant, label:`TUO ${id}`, priority:60, visualWeight:id === "masthead" || id === "callout" ? "strong" : "medium", surface:["quote","cta"].includes(id) ? "panel" : "open", emphasisCost:id === "prose" ? 0 : 1, styles:{} }, ...variants] }, null, 2) + "\n";
}
const optionsLevel = { heading:2, subheading:3, minor:4 };
function componentFromSample(id, source, options) {
  const { html: raw, styles } = safeHtml(source);
  let html = raw;
  const slots = [];
  if (options.type === "title") { html = html.replace(/<figure\b[\s\S]*?<\/figure>/giu, "").replace(/<img\b[^>]*>/gu, ""); if (!html.includes("data-component-root")) html = html.replace(/<([a-z][a-z0-9-]*)(\b[^>]*)>/iu, "<$1 data-component-root$2>"); html = replaceText(html, "在留白里，重新看见内容", "content"); slots.push({name:"content",source:"content",required:true}); }
  if (options.type === "heading") { html = replaceText(html, "从信息开始建立秩序", "content"); slots.push({name:"content",source:"content",required:true}); }
  if (options.type === "subheading") { html = replaceText(html, "让层级承担解释工作", "content"); slots.push({name:"content",source:"content",required:true}); }
  if (options.type === "minor") { html = replaceText(html, "细节不是装饰，而是阅读线索", "content"); slots.push({name:"content",source:"heading-title",required:true}); }
  if (options.type === "body") { html = replaceText(html, options.sample, "content"); slots.push({name:"content",source:"content",required:true}); }
  if (options.type === "lead") { html = replaceText(html, "真", "initial"); html = replaceText(html, "正好的排版，不会抢走文章本身的声音。它只是在读者需要停顿的时候，留出恰到好处的空间。", "remainder"); slots.push({name:"initial",source:"content-initial",required:true},{name:"remainder",source:"content-remainder",required:true}); }
  if (options.type === "quote") { html = replaceText(html, "排版的目的，不是让页面变得热闹，而是让内容更容易被读完。", "content"); const hasAttribution = html.includes("— 组件标本"); html = replaceText(html, "— 组件标本", "attribution"); slots.push({name:"content",source:"quote-content",required:true}); if (hasAttribution) slots.push({name:"attribution",source:"quote-attribution",required:false}); }
  if (options.type === "cta") { html = replaceText(html, "现在，回到你的文章，删掉一个不必要的强调。", "prompt"); slots.push({name:"prompt",source:"cta-prompt",required:true}); }
  if (options.type === "image") { html = html.replace(/\ssrc="[^"]*"/u, " data-attribute-slot-src=\"src\"").replace(/\salt="[^"]*"/u, " data-attribute-slot-alt=\"alt\""); html = replaceText(html, "LIGHT &amp; SHADOW", "caption"); slots.push({name:"src",source:"image-src",required:true},{name:"alt",source:"image-alt",required:true},{name:"caption",source:"image-caption",required:false}); }
  html = html.replace(/>([^<>]*\S[^<>]*)</gu, (_all, text) => `><span data-decorative>${text}</span><`);
  return { html, json: definition(id, options.kind, options.blockTypes, slots, "source", styles, html) };
}
function listComponent(orderedHtml, unorderedHtml) {
  const orderedSample = safeHtml(orderedHtml), unorderedSample = safeHtml(unorderedHtml);
  const extract = (entry, kind) => {
    const root = entry.html.match(/<(ul|ol)\b([^>]*)>[\s\S]*?<\/(?:ul|ol)>/u); if (!root) throw new Error("missing list root");
    const li = entry.html.match(/<li\b([^>]*)>[\s\S]*?<\/li>/u); const spans = [...entry.html.matchAll(/<span\b([^>]*)>/gu)];
    const role = (text) => (text.match(/data-style-role="([^"]+)"/u) ?? [])[1];
    const styles = { ...entry.styles, item: entry.styles[role(li?.[1] ?? "")] ?? {}, itemMarker: entry.styles[role(spans[0]?.[1] ?? "")] ?? {}, itemContent: entry.styles[role(spans[1]?.[1] ?? "")] ?? {} };
    const rootAttrs = root[2]; const rootRole = role(rootAttrs); const listStyles = entry.styles[rootRole] ?? {}; delete styles[rootRole];
    const marker = kind === "ordered" ? "two-digit-arabic" : "source";
    return { template:`<${kind === "ordered" ? "ol" : "ul"} data-component-root data-list-kind="${kind}" data-style-role="list"><slot name="items"></slot></${kind === "ordered" ? "ol" : "ul"}>`, styles:{ root:{ margin:"0", padding:"0" }, list:{color:"{color.ink}",...listStyles}, item:{display:"block",...styles.item}, itemMarker:{display:"inline-block",width:"2em",...styles.itemMarker}, itemContent:{display:"inline-block",width:"calc(100% - 2em)",...styles.itemContent} }, marker };
  };
  const o = extract(orderedSample,"ordered"), u = extract(unorderedSample,"unordered");
  const template = `<section data-component-root data-style-role="root"><ol data-list-kind="ordered" data-style-role="list"><slot name="items"></slot></ol><ul data-list-kind="unordered" data-style-role="list"><slot name="items"></slot></ul></section>`;
  const base = { ...o.styles, list:o.styles.list }; const variants=[{ id:"unordered", label:"TUO unordered list", priority:70, visualWeight:"medium", surface:"open", emphasisCost:0, accepts:{blockTypes:["list"]}, styles:u.styles }];
  return definition("list","list",["list"],[{name:"items",source:"list-items",required:true,format:"two-digit-arabic"}],"ordered",base,template,[...variants]);
}
function manifest(id, source, spec) {
  const t=spec.tokens, r=t.layout.rhythm; const modes={dense:r.modes.compact,balanced:r.modes.balanced,airy:r.modes.spacious};
  const essay = { flow:{label:"正文流动",visualWeight:"quiet",surface:"open",emphasisCost:0,styles:{}}, pause:{label:"短句停顿",visualWeight:"medium",surface:"open",emphasisCost:1,styles:{r0:{"border-left":"2px solid {color.accent}","padding-left":"14px"}}}, pivot:{label:"论述转场",visualWeight:"medium",surface:"panel",emphasisCost:1,styles:{r0:{"background-color":"{color.soft}",padding:"18px","border-radius":"{radius}"}}}, release:{label:"结尾余韵",visualWeight:"medium",surface:"open",emphasisCost:1,styles:{r0:{color:"{color.accent}","text-align":"center"}}} };
  return JSON.stringify({ specVersion:"1.0", id, version:"1.0.0", name:spec.name, description:spec.description, recommendation:{summary:spec.eyebrow,articleTypes:source.types,tones:source.tones,structurePatterns:source.patterns}, defaultDensity:"balanced", essay, tokens:{color:{paper:t.paper,ink:t.color,muted:t.muted,accent:t.accent,soft:t.accentSoft},type:{body:t.bodyFont,heading:t.headingFont},size:{title:"29px",heading:"17px",body:"14px",meta:"11px"},lineHeight:{body:String(t.lineHeight),heading:"1.6",compact:"1.5"},alignment:{left:"left",center:"center",right:"right",justify:"justify"},canvas:{background:t.background,padding:"0 20px 96px"},radius:`${t.radius}px`}, rhythm:{modes,relationMap:{default:"flow","same-group":"break",continuation:"flow","new-argument":"break","turning-point":"turn","before-strong-block":"turn","after-strong-block":"flow","new-section":"section","before-ending":"release"}},budgets:{maxStrongPerSection:1,maxSurfaceRatio:.3,noAdjacentStrong:true},componentPaths:ordered.map((name)=>`components/${name}/component.json`) },null,2)+"\n";
}
for (const [sourceId, config] of Object.entries(names)) {
  const sourceTheme=path.join(sourceRoot,sourceId); const targetTheme=path.join(targetRoot,config.id); const spec=JSON.parse(await readFile(path.join(sourceTheme,"theme-spec.json"),"utf8"));
  await rm(targetTheme,{recursive:true,force:true}); await mkdir(targetTheme,{recursive:true}); await writeFile(path.join(targetTheme,"theme.json"),manifest(config.id,config,spec));
  for (const id of ordered) { await mkdir(path.join(targetTheme,"components",id),{recursive:true}); }
  for (const id of ordered.filter((entry)=>entry!=="list")) {
    const file=sourceFiles[id]; const sample=await readFile(path.join(sourceTheme,"components",`${file}.html`),"utf8");
    const options={ masthead:{type:"title",kind:"masthead",blockTypes:["article-title"]}, heading:{type:"heading",kind:"heading",blockTypes:["heading"],levels:[2]}, subheading:{type:"subheading",kind:"heading",blockTypes:["heading"],levels:[3]}, minor:{type:"minor",kind:"heading",blockTypes:["heading"],levels:[4]}, lead:{type:"lead",kind:"prose",blockTypes:["lead"]}, prose:{type:"body",sample:"正文需要稳定的字级、行高和内容轨道。连续段落保持流动，新论点出现时再拉开距离。",kind:"prose",blockTypes:["paragraph"]}, focus:{type:"body",sample:"留白不是空，它是内容之间的关系。",kind:"prose",blockTypes:["paragraph"]}, quote:{type:"quote",kind:"quote",blockTypes:["quote"]}, callout:{type:"body",sample:"把注意力留给真正重要的那一句。",kind:"prose",blockTypes:["callout"]}, cta:{type:"cta",kind:"cta",blockTypes:["cta"]}, image:{type:"image",kind:"image",blockTypes:["image"]}, ending:{type:"body",sample:"愿每一次停顿，都让下一段文字更清楚。",kind:"ending",blockTypes:["ending"]} }[id];
    const result=componentFromSample(id,sample,options); await writeFile(path.join(targetTheme,"components",id,"template.html"),result.html); await writeFile(path.join(targetTheme,"components",id,"component.json"),result.json);
  }
  const orderedList=await readFile(path.join(sourceTheme,"components","08-ordered-list.html"),"utf8"), unorderedList=await readFile(path.join(sourceTheme,"components","09-unordered-list.html"),"utf8");
  await writeFile(path.join(targetTheme,"components","list","template.html"),`<section data-component-root data-style-role="root"><ol data-list-kind="ordered" data-style-role="list"><slot name="items"></slot></ol><ul data-list-kind="unordered" data-style-role="list"><slot name="items"></slot></ul></section>`); await writeFile(path.join(targetTheme,"components","list","component.json"),listComponent(orderedList,unorderedList));
  await cp(path.join(sourceTheme,"theme-spec.json"),path.join(targetTheme,"tuo-theme-spec.json"));
}
