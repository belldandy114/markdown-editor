import TurndownService from 'turndown'

const ts = new TurndownService({
  headingStyle: 'atx', codeBlockStyle: 'fenced',
  emDelimiter: '*', strongDelimiter: '**',
  bulletListMarker: '-', linkStyle: 'inlined',
})

const tests = [
  ['normal h3', '<h3 id="hello">Hello World</h3>'],
  ['h3 with /', '<h3 id="x">With/Slash</h3>'],
  ['h3 with \\\\', '<h3 id="x">With\\\\Backslash</h3>'],
  ['h3 star', '<h3 id="x">With *star*</h3>'],
  ['h3 path', '<h3 id="x">C:\\\\Users\\\\test</h3>'],
  ['h3 numbered', '<h3 id="x">步骤 3：测试</h3>'],
  ['full doc', '<h3 id="a">AAA</h3><p>para</p><h3 id="b">BBB</h3>'],
  ['h3 plus para', '<p>before</p><h3 id="t">Title</h3><p>after</p>'],
]

for (const [name, html] of tests) {
  const raw = ts.turndown(html)
  // 应用剥离转义规则（与 Vue 组件中一致）
  const md = raw.replace(/\\([\\*_~`\[\]()#+\-\.!|])/g, '$1')
  const slashMd = (md.match(/\//g) || []).length
  const slashHtml = (html.match(/\//g) || []).length
  const bsMd = (md.match(/\\/g) || []).length
  const bsHtml = (html.match(/\\/g) || []).length

  console.log(name + ':')
  console.log('  RAW: ' + JSON.stringify(raw))
  console.log('  MD:  ' + JSON.stringify(md))
  if (slashMd > slashHtml) console.log('  ** +' + (slashMd - slashHtml) + ' FORWARD SLASHES **')
  if (bsMd > bsHtml) console.log('  ** +' + (bsMd - bsHtml) + ' BACKSLASHES **')
  if (slashMd === slashHtml && bsMd === bsHtml) console.log('  ✓ no extra slashes')
  console.log()
}
