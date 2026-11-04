const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const repo = process.env.DOCS_WORKTREE;
const output = process.env.EVIDENCE_DIR;
const cases = [
  {lang:'en',path:'/radeon-cloud-docs/resources/faq/',section:'Access',question:'Why does accessing GitHub or fetching notebooks fail from an instance?',answer:'Due to network restrictions, GitHub is not reliably reachable from instances. Please download the notebook locally and upload it through JupyterLab, or use a mirror such as Gitee.',scope:'This applies to both the China and Global sites.'},
  {lang:'zh-cn',path:'/radeon-cloud-docs/zh-cn/resources/faq/',section:'访问',question:'为什么实例内访问 GitHub 或拉取 Notebook 会失败？',answer:'由于网络限制，实例内无法稳定访问 GitHub；请在本地下载后通过 JupyterLab 上传，或使用国内镜像（如 Gitee）。',scope:'此说明适用于中国站和 Global。'}
];
(async()=>{
  const server = spawn('npm',['run','preview','--','--host','127.0.0.1','--port','18779'],{cwd:repo,stdio:'ignore'});
  let browser;
  const results=[];
  try {
    let ready=false;
    for(let i=0;i<100;i++) {try {if((await fetch('http://127.0.0.1:18779'+cases[0].path)).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
    if(!ready)throw Error('Preview server unavailable');
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN});
    for(const test of cases)for(const size of [{name:'desktop',width:1440,height:960},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:size.width,height:size.height},colorScheme:'light'});
      const response=await page.goto('http://127.0.0.1:18779'+test.path,{waitUntil:'networkidle'});
      if(response.status()!==200)throw Error('FAQ response is not 200');
      await page.evaluate(()=>document.fonts.ready);
      const content=await page.locator('main').innerText();
      for(const expected of [test.question,test.answer,test.scope])if(!content.includes(expected))throw Error('Exact wording mismatch: '+test.lang);
      if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Horizontal page overflow');
      await page.getByRole('heading',{name:test.section,exact:true}).evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-100));
      const screenshot=`faq-${test.lang}-${size.name}.png`;
      await page.screenshot({path:output+'/'+screenshot});
      results.push({language:test.lang,viewport:size.name,path:test.path,status:response.status(),exactText:true,horizontalOverflow:false,screenshot});
      await page.close();
    }
    fs.writeFileSync(output+'/preview-results.json',JSON.stringify({environment:'Isolated documentation build preview; no production deployment or instance networking test',data:'Public documentation content only',node:process.version,browser:browser.version(),at:new Date().toISOString(),results},null,2));
    console.log('PASS: four FAQ previews; exact wording, two-site scope and viewport overflow checks.');
  } finally {if(browser)await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1});
