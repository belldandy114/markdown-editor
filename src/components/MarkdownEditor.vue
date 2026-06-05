<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'
import { useTheme } from '@/composables/useTheme'
import { EditPen, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const emit = defineEmits<{
  (e: 'export', format: 'html' | 'pdf' | 'png', overwrite?: boolean): void
  (e: 'export-last', overwrite?: boolean): void
}>()

const { activeFile, saveFile, updateContent, activeFileId, dirty, switchWorkspace, workspaceDir, editorScrollRatio, setEditorScrollRatio, previewScrollRatio, setPreviewScrollRatio, lockScroll, isLocked, onHeadingJump, removeHeadingJump, loadFileFromPath } = useMarkdownFiles()
const { theme, toggleTheme } = useTheme()

const content = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumbers = ref<number[]>([])
const wordCount = ref(0)
const lineCount = ref(0)

function getTa() { return textareaRef.value }
function getSel() { const t = getTa(); if (!t) return null; return { s: t.selectionStart, e: t.selectionEnd } }

/** 内容替换 + requestAnimationFrame 光标设置，保证在 v-model DOM 更新之后 */
function domReplace(s: number, e: number, text: string, done?: (ta: HTMLTextAreaElement) => void): void {
  const t = getTa()
  if (!t) return
  snapshot(true)
  t.setRangeText(text, s, e, 'preserve')
  // 同步给 Vue（会触发 v-model 更新 textarea.value 并重置光标）
  content.value = t.value
  updateContent(content.value)
  updateStats(content.value)
  // rAF 在浏览器帧之后执行，此时 Vue 的 v-model DOM 更新已完成
  if (done) requestAnimationFrame(() => done(t))
}

function replaceRange(s: number, e: number, text: string, cursorPos?: number): void {
  snapshot(true)
  content.value = content.value.substring(0, s) + text + content.value.substring(e)
  updateContent(content.value); updateStats(content.value)
  // 恢复光标（preventScroll 防止 focus 触发页面跳转）
  const pos = cursorPos ?? Math.min(s + text.length, content.value.length)
  nextTick(() => {
    const t = getTa()
    if (t) { t.focus({preventScroll:true}); t.selectionStart = t.selectionEnd = pos }
  })
}

function insertAtCursor(text: string): void {
  const sel = getSel(); if (!sel) return
  const cursorPos = text.indexOf('{cursor}')
  let insertText = text
  if (cursorPos >= 0) {
    insertText = text.replace(/\{cursor\}/g, '')
  }
  domReplace(sel.s, sel.e, insertText, (ta) => {
    const pos = cursorPos >= 0 ? sel.s + cursorPos : sel.s + insertText.length
    ta.focus({preventScroll:true})
    ta.selectionStart = ta.selectionEnd = pos
  })
}

function wrapSel(before: string, after: string): void {
  const sel = getSel(); if (!sel) return
  const st = content.value.substring(sel.s, sel.e) || '内容'
  domReplace(sel.s, sel.e, before + st + after, (ta) => {
    ta.focus({preventScroll:true})
    ta.selectionStart = sel.s + before.length
    ta.selectionEnd = sel.s + before.length + st.length
  })
}

function linePref(prefix: string): void {
  const t = getTa(); if (!t) return; const s = t.selectionStart
  const ls = content.value.lastIndexOf('\n', s - 1) + 1
  domReplace(ls, ls, prefix, (ta) => {
    ta.focus({preventScroll:true})
    ta.selectionStart = ta.selectionEnd = s + prefix.length
  })
}

const fmt: Record<string, Function> = {
  bold() { wrapSel('**', '**') },
  italic() { wrapSel('*', '*') },
  strike() { wrapSel('~~', '~~') },
  code() { wrapSel('`', '`') },
  heading(l: any) { linePref('#'.repeat(Number(l)) + ' ') },
  para() { linePref('') },
  codeBlock(l = '') { insertAtCursor('\n```' + l + '\n{cursor}\n```\n') },
  link() { wrapSel('[', '](url)') },
  image() { wrapSel('![', '](url)') },
  formula() { insertAtCursor('$$\n{cursor}\n$$') },
  hr() { insertAtCursor('{cursor}\n---\n') },
  quote() { linePref('> ') },
  ul() { linePref('- ') },
  ol() { linePref('1. ') },
  table() { ElMessageBox.prompt('输入行列数（如 3x4）', '插入表格', { inputValue: '3x3', confirmButtonText:'确定', cancelButtonText:'取消', inputPattern: /^\d+[xX×]\d+$/, inputErrorMessage:'格式：3x4' }).then(({value})=>{const[rs,cs]=value.split(/[xX×]/).map(Number);let t='\n|';for(let c=0;c<cs;c++)t+='   |';t+='\n|';for(let c=0;c<cs;c++)t+='---|';for(let r=0;r<rs-1;r++){t+='\n|';for(let c=0;c<cs;c++)t+=` {cursor} |`}insertAtCursor(t)}).catch(()=>{}) },
  task() {
    const t = getTa(); if(!t)return; const s=t.selectionStart
    const ls=content.value.lastIndexOf('\n',s-1)+1; const line=content.value.substring(ls,s)
    const m=line.match(/^(\s*)([-*+])\s(\[.]\s)?(.*)$/)
    if(m){const i=m[1],mk=m[2],ck=m[3],r=m[4]
      if(ck)replaceRange(ls,s,i+mk+(ck.includes('x')?' [ ] ':' [x] ')+r)
      else replaceRange(ls,s,i+mk+' [ ] '+line.trim())
    }else{const tr=line.trimStart();replaceRange(ls,s,line.substring(0,line.length-tr.length)+'- [ ] '+tr)}
    nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=s+6})
  },
  tableOp(op: string) {
    const t=getTa();if(!t)return;const cursorLine=content.value.substring(0,t.selectionStart).split('\n').length-1
    const lines=content.value.split('\n');let ts=cursorLine,te=cursorLine
    while(ts>0&&lines[ts-1].trim().startsWith('|'))ts--
    while(te<lines.length-1&&lines[te+1].trim().startsWith('|'))te++
    if(te-ts<2||!lines[ts].trim().startsWith('|'))return
    const rows=lines.slice(ts,te+1).map(r=>r.split('|').slice(1,-1).map(c=>c.trim()))
    const cols=rows[0].length
    switch(op){
      case'col-left':for(const r of rows)r.splice(0,0,'');break
      case'col-right':for(const r of rows)r.splice(cols,0,'');break
      case'row-above':rows.splice(1,0,Array(cols).fill(''));break
      case'row-below':rows.splice(rows.length,0,Array(cols).fill(''));break
      case'del-col':if(cols>1)for(const r of rows)r.splice(0,1);break
      case'del-row':if(rows.length>2)rows.splice(1,1);break
      case'row-up':if(rows.length>2){[rows[1],rows[2]]=[rows[2],rows[1]]};break
      case'row-down':if(rows.length>2){[rows[1],rows[2]]=[rows[2],rows[1]]};break
      case'del-table':{const b=lines.slice(0,ts).join('\n'),a=lines.slice(te+1).join('\n'),j=b.length&&a.length?'\n':'';content.value=b+j+a;updateContent(content.value);updateStats(content.value);return}
      case'copy-table':navigator.clipboard.writeText(lines.slice(ts,te+1).join('\n'));return
    }
    const ws=Array(cols).fill(0);for(const r of rows)for(let c=0;c<cols;c++)ws[c]=Math.max(ws[c],(r[c]||'').length)
    const nr=rows.map((r,i)=>i===1?'|'+ws.map(w=>'-'.repeat(Math.max(w,3))).join('|')+'|':'|'+r.map((v,ci)=>' '+(v||'').padEnd(ws[ci])+' ').join('|')+'|')
    const ori=lines.slice(0,ts).join('\n').length+(ts>0?1:0),end=lines.slice(0,te+1).join('\n').length
    replaceRange(ori,end,nr.join('\n'))
  },
  stripLeading(){const r=getSel();if(!r)return;const tx=content.value.substring(r.s,r.e);replaceRange(r.s,r.e,tx.split('\n').map(l=>l.trimStart()).join('\n'))},
  stripTrailing(){const r=getSel();if(!r)return;const tx=content.value.substring(r.s,r.e);replaceRange(r.s,r.e,tx.split('\n').map(l=>l.trimEnd()).join('\n'))},
  stripBoth(){const r=getSel();if(!r)return;const tx=content.value.substring(r.s,r.e);replaceRange(r.s,r.e,tx.split('\n').map(l=>l.trim()).join('\n'))},
  tab2space(){const r=getSel();if(!r)return;replaceRange(r.s,r.e,content.value.substring(r.s,r.e).replace(/\t/g,'  '))},
  space2tab(){const r=getSel();if(!r)return;replaceRange(r.s,r.e,content.value.substring(r.s,r.e).replace(/  /g,'\t'))},
  space2tabLead(){const r=getSel();if(!r)return;replaceRange(r.s,r.e,content.value.substring(r.s,r.e).split('\n').map(l=>l.replace(/^(\s+)/,m=>'\t'.repeat(Math.floor(m.length/2)))).join('\n'))},
  rmEmpty(){const r=getSel();if(!r)return;replaceRange(r.s,r.e,content.value.substring(r.s,r.e).split('\n').filter(l=>l.trim()).join('\n'))},
  rmDup(){const s=new Set<string>();const r=getSel()||{s:0,e:content.value.length};if(r.s===r.e){r.s=0;r.e=content.value.length}replaceRange(r.s,r.e,content.value.substring(r.s,r.e).split('\n').filter(l=>{if(s.has(l))return false;s.add(l);return true}).join('\n'))},
  markDup(){const t=getTa();const saved=t?.selectionStart??0;const s=new Map<string,number>();const lines=content.value.split('\n');const res=lines.map(l=>{const k=l.trim();if(!k)return l;const c=(s.get(k)||0)+1;s.set(k,c);return c>1?l+' ← 重复':l});content.value=res.join('\n');updateContent(content.value);updateStats(content.value);nextTick(()=>{if(t){t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=Math.min(saved,content.value.length)}})},
  copyLine(){const t=getTa();if(!t)return;const s=t.selectionStart;const ls=content.value.lastIndexOf('\n',s-1)+1;const le=content.value.indexOf('\n',s);const e=le===-1?content.value.length:le;const l=content.value.substring(ls,e);const nv=content.value.substring(0,e)+'\n'+l+content.value.substring(e);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=e+1+(s-ls)})},
}

const showSearch=ref(false);const sq=ref('');const smi=ref(0);const sma=ref<number[]>([]);const replaceText=ref('')
function onSearchChange(v:any){sq.value=typeof v==='string'?v:'';doSearch()}
function toggleSearch(){showSearch.value=!showSearch.value;if(showSearch.value)nextTick(()=>document.getElementById('es')?.focus({preventScroll:true}));else{sq.value='';sma.value=[];smi.value=0}}
function doSearch(){if(!sq.value||!content.value){sma.value=[];smi.value=0;return}const q=sq.value.toLowerCase();const tx=content.value.toLowerCase();const m:number[]=[];let i=0;while(true){const p=tx.indexOf(q,i);if(p===-1)break;m.push(p);i=p+1}sma.value=m;smi.value=m.length?0:0;if(m.length)hl(m[0],q.length)}
function hl(p:number,l:number){const t=getTa();if(!t)return;t.focus({preventScroll:true});t.selectionStart=p;t.selectionEnd=p+l;t.scrollTop=Math.max(0,(content.value.substring(0,p).split('\n').length-1)*22-100)}
function nx(){if(!sma.value.length)return;smi.value=(smi.value+1)%sma.value.length;hl(sma.value[smi.value],sq.value.length);setTimeout(()=>getTa()?.focus({preventScroll:true}),0)}
function pv(){if(!sma.value.length)return;smi.value=(smi.value-1+sma.value.length)%sma.value.length;hl(sma.value[smi.value],sq.value.length);setTimeout(()=>getTa()?.focus({preventScroll:true}),0)}
function replaceOne(){if(!sma.value.length||!sq.value)return;const pos=sma.value[smi.value];saveUndo();const rep=replaceText.value;const nv=content.value.substring(0,pos)+rep+content.value.substring(pos+sq.value.length);content.value=nv;updateContent(nv);updateStats(nv);sma.value=sma.value.slice(1).map(m=>m-pos+pos+rep.length-(sq.value.length-rep.length));smi.value=0;if(sma.value.length)hl(sma.value[0],rep.length)}
function replaceAll(){if(!sma.value.length||!sq.value)return;saveUndo();const q=sq.value;const rep=replaceText.value;let result='';let last=0;let cnt=0;for(const pos of[...sma.value]){result+=content.value.substring(last,pos)+rep;last=pos+q.value.length;cnt++}result+=content.value.substring(last);content.value=result;updateContent(result);updateStats(result);sma.value=[];smi.value=0}

interface CI{label?:string;sc?:string;ac?:string;div?:boolean;ch?:CI[]}
const ci:CI[]=[
  // 基础操作
  {label:'复制',sc:'Ctrl+C',ac:'copy'},{label:'粘贴',sc:'Ctrl+V',ac:'paste'},{label:'剪切',sc:'Ctrl+X',ac:'cut'},{label:'',div:true},
  {label:'撤销',sc:'Ctrl+Z',ac:'undo'},{label:'重做',sc:'Ctrl+Y',ac:'redo'},{label:'',div:true},
  {label:'清除样式',sc:'Ctrl+Shift+C',ac:'clearFmt'},

  // 格式
  {label:'',div:true},{label:'格式',ch:[
    {label:'标题 1',sc:'Ctrl+1',ac:'h1'},{label:'标题 2',sc:'Ctrl+2',ac:'h2'},{label:'标题 3',sc:'Ctrl+3',ac:'h3'},
    {label:'标题 4',sc:'Ctrl+4',ac:'h4'},{label:'标题 5',sc:'Ctrl+5',ac:'h5'},{label:'标题 6',sc:'Ctrl+6',ac:'h6'},
    {label:'段落',sc:'Ctrl+0',ac:'p'},{label:'',div:true},
    {label:'加粗',sc:'Ctrl+B',ac:'bold'},{label:'斜体',sc:'Ctrl+I',ac:'italic'},{label:'删除线',sc:'Ctrl+Shift+S',ac:'strike'},{label:'行内代码',sc:'Ctrl+`',ac:'code'},
  ]},

  // 列表
  {label:'列表',ch:[
    {label:'无序列表',sc:'Ctrl+Shift+U',ac:'ul'},{label:'有序列表',sc:'Ctrl+Shift+O',ac:'ol'},
    {label:'任务列表',sc:'Ctrl+Shift+T',ac:'task'},{label:'引用',sc:'Ctrl+Shift+Q',ac:'quote'},
  ]},

  // 插入
  {label:'插入',ch:[
    {label:'链接',sc:'Ctrl+K',ac:'link'},{label:'图片',sc:'Ctrl+Shift+I',ac:'img'},{label:'代码块',sc:'Ctrl+Shift+K',ac:'code-block'},
    {label:'行内代码',ac:'inline-code'},
    {label:'',div:true},
    {label:'公式',sc:'Ctrl+Shift+M',ac:'formula'},{label:'分割线',sc:'Ctrl+Shift+H',ac:'hr'},
  ]},

  // 表格操作
  {label:'表格操作',ch:[
    {label:'插入表格',ac:'tbl-in'},
    {label:'上方插入行',ac:'tbl-ra'},{label:'下方插入行',ac:'tbl-rb'},
    {label:'左侧插入列',ac:'tbl-cl'},{label:'右侧插入列',ac:'tbl-cr'},
    {label:'',div:true},
    {label:'上移该行',ac:'tbl-ru'},{label:'下移该行',ac:'tbl-rd'},
    {label:'删除行',ac:'tbl-dr'},{label:'删除列',ac:'tbl-dc'},
    {label:'',div:true},
    {label:'复制表格',ac:'tbl-cp'},{label:'删除表格',ac:'tbl-dt'},
  ]},

  // 工具
  {label:'工具',ch:[
    {label:'移除空行',sc:'Ctrl+Shift+E',ac:'rmE'},{label:'删除重复行',sc:'Ctrl+Shift+D',ac:'rmD'},{label:'标记重复行',ac:'mkD'},{label:'复制当前行',sc:'Ctrl+D',ac:'cpL'},
    {label:'',div:true},
    {label:'去除行首空白',ac:'stripL'},{label:'去除行尾空白',ac:'stripT'},{label:'去除行首尾空白',ac:'stripB'},
    {label:'',div:true},
    {label:'TAB→空格',ac:'t2s'},{label:'空格→TAB',ac:'s2t'},
  ]},
]
const cx=ref(false);const cxx=ref(0);const cxy=ref(0);const actSub=ref('');const ctxUp=ref(false);const subTimer=ref<ReturnType<typeof setTimeout>|null>(null)
const savedSel={s:0,e:0}
function saveSel(){const t=getTa();if(t){savedSel.s=t.selectionStart;savedSel.e=t.selectionEnd}}
function restoreSel(){const t=getTa();if(t){t.focus({preventScroll:true});t.selectionStart=savedSel.s;t.selectionEnd=savedSel.e}}
function onMenuChange(v:boolean){if(v){}else{restoreSel()}}
function onSubEnter(l:string){if(subTimer.value)clearTimeout(subTimer.value);actSub.value=l}
function onSubLeave(l:string){subTimer.value=setTimeout(()=>{if(actSub.value===l)actSub.value=''},80)}
function sc(e:MouseEvent){e.preventDefault();const y=e.clientY;const h=window.innerHeight;const menuH=380;cxx.value=e.clientX;cx.value=true;const up=h-y<menuH;cxy.value=up?Math.max(0,y-menuH):y;ctxUp.value=up}

/** 失焦时保存选区，并尝试恢复焦点到非输入元素的情况 */
function onTextareaBlur(): void {
  saveSel()
  // setTimeout(0) 在 click 事件处理器全部完成后运行，
  // 检测焦点是否去了非输入元素（按钮/导航等），若是则恢复
  setTimeout(() => {
    const t = getTa()
    if (!t || savedSel.s === savedSel.e) return
    const active = document.activeElement
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return
    if (active === document.body || !active || active === t) return
    // 焦点在非输入元素上 → 恢复 textarea 焦点和选区
    restoreSel()
  }, 0)
}
/** 聚焦时恢复选区 */
function onTextareaFocus(): void {
  const t = getTa()
  if (t && savedSel.s !== savedSel.e) {
    t.selectionStart = savedSel.s
    t.selectionEnd = savedSel.e
  }
}
/** 点击顶部导航栏/编辑器工具栏/头部后恢复焦点和选区（解决全选后高亮消失的问题） */
function onHeaderClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  const ta = getTa()
  if (!ta || savedSel.s === savedSel.e) return
  if (target === ta || ta.contains(target)) return // 点 textarea 本身不处理

  // 在以下区域内点击时，操作完成后恢复选区
  const scope = target.closest('.app-header, .tb, .hdr, .editor-panel')
  if (scope) {
    nextTick(() => restoreSel())
  }
}
function hc(){cx.value=false;actSub.value=''}
function ca(a:string){hc();const t=getTa();if(!t)return
  const map:Record<string,()=>void>={
    copy:()=>document.execCommand('copy'),paste:()=>{
      navigator.clipboard.read().then(items=>{
        for(const item of items){
          const imgType=item.types.find(t=>t.startsWith('image/'))
          if(imgType){item.getType(imgType).then(blob=>{
            if(blob.size<10*1024*1024){
              const ext=blob.type.split('/')[1]||'png';const name=`image-${Date.now()}.${ext}`
              const r=new FileReader();r.onload=async()=>{
                const fp=await window.electronAPI?.saveImage(workspaceDir.value,name,r.result)
                if(fp){const rel=`.assets/${name}`;const s=t.selectionStart,e=t.selectionEnd;replaceRange(s,e,`![${name}](${rel})`);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=s+rel.length+name.length+5})}
              };r.readAsDataURL(blob)
            }
          });return}
        }
        navigator.clipboard.readText().then(tx=>{const s=t.selectionStart,e=t.selectionEnd;if(tx.startsWith('data:image/')){pasteDataImage(s,e,tx);return}replaceRange(s,e,tx)})
      }).catch(()=>navigator.clipboard.readText().then(tx=>{const s=t.selectionStart,e=t.selectionEnd;if(tx.startsWith('data:image/')){pasteDataImage(s,e,tx);return}replaceRange(s,e,tx)}))
    },cut:()=>document.execCommand('cut'),
    h1:()=>fmt.heading(1),h2:()=>fmt.heading(2),h3:()=>fmt.heading(3),h4:()=>fmt.heading(4),h5:()=>fmt.heading(5),h6:()=>fmt.heading(6),p:()=>fmt.para(),bold:()=>fmt.bold(),italic:()=>fmt.italic(),strike:()=>fmt.strike(),code:()=>fmt.code(),'code-block':()=>fmt.codeBlock(),'inline-code':()=>fmt.code(),task:()=>fmt.task(),
    'tbl-in':()=>fmt.table(),'tbl-ra':()=>fmt.tableOp('row-above'),'tbl-rb':()=>fmt.tableOp('row-below'),'tbl-cl':()=>fmt.tableOp('col-left'),'tbl-cr':()=>fmt.tableOp('col-right'),
    'tbl-ru':()=>fmt.tableOp('row-up'),'tbl-rd':()=>fmt.tableOp('row-down'),'tbl-dr':()=>fmt.tableOp('del-row'),'tbl-dc':()=>fmt.tableOp('del-col'),
    'tbl-cp':()=>fmt.tableOp('copy-table'),'tbl-dt':()=>fmt.tableOp('del-table'),
    undo:()=>undo(),redo:()=>redo(),clearFmt:()=>clearFormat(),
    stripL:()=>fmt.stripLeading(),stripT:()=>fmt.stripTrailing(),stripB:()=>fmt.stripBoth(),t2s:()=>fmt.tab2space(),s2t:()=>fmt.space2tab(),s2tL:()=>fmt.space2tabLead(),
    rmE:()=>fmt.rmEmpty(),rmD:()=>fmt.rmDup(),mkD:()=>fmt.markDup(),cpL:()=>fmt.copyLine(),
    link:()=>fmt.link(),img:()=>fmt.image(),formula:()=>fmt.formula(),hr:()=>fmt.hr(),ul:()=>fmt.ul(),ol:()=>fmt.ol(),quote:()=>fmt.quote(),
  }
  map[a]?.()
  // 恢复编辑器焦点和选区
  nextTick(()=>{const t=getTa();if(t){const s=t.selectionStart;t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=s}})
}
onMounted(()=>{
  document.addEventListener('click',hc)
  document.addEventListener('click',onHeaderClick)
})
onUnmounted(()=>{
  document.removeEventListener('click',hc)
  document.removeEventListener('click',onHeaderClick)
})

/** 粘贴处理：支持直接粘贴图片（保存到 .assets/ 目录，插入相对路径） */
/** 将 data:image URL 保存到 .assets/ 并插入 markdown 引用，失败时弹警告 */
function pasteDataImage(s:number,e:number,tx:string):void{
  const m=tx.match(/^data:image\/(\w+)/i)
  const ext=m?m[1].toLowerCase():'png'
  const fn=`image-${Date.now()}.${ext==='jpeg'?'jpg':ext}`
  window.electronAPI?.saveImage(workspaceDir.value,fn,tx).then(fp=>{const t=getTa()
    if(fp&&t){const r=`.assets/${fn}`;replaceRange(s,e,`![${fn}](${r})`);t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=s+r.length+fn.length+5}
    else ElMessage.warning('粘贴图片保存失败')
  })
}
/** 将粘贴的图片文件/blob 保存到 .assets/ 并插入 markdown 引用 */
function savePastedBlob(s:number,e:number,blob:Blob,name:string){
  const reader=new FileReader();reader.onload=async()=>{
    const fp=await window.electronAPI?.saveImage(workspaceDir.value,name,reader.result)
    if(fp){const r=`.assets/${name}`;replaceRange(s,e,`![${name}](${r})`);nextTick(()=>{const t=getTa();if(t){t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=s+r.length+name.length+5}})}
  };reader.readAsDataURL(blob)
}
function hp(ev:ClipboardEvent){ev.preventDefault();const t=getTa();if(!t)return;const s=t.selectionStart,e=t.selectionEnd
  // 1) 先检查 clipboardData.files（文件粘贴 / 截图粘贴）
  const f=ev.clipboardData?.files?.item?.(0)
  if(f&&f.type.startsWith('image/')&&f.size<10*1024*1024){const ext=f.type.split('/')[1]||'png';savePastedBlob(s,e,f,`image-${Date.now()}.${ext}`);return}
  // 2) 检查 clipboardData.items（ClipboardItem 写入的图片）
  for(let i=0;i<(ev.clipboardData?.items.length||0);i++){
    const it=ev.clipboardData!.items[i]
    if(it.type.startsWith('image/')){const blob=it.getAsFile();if(blob&&blob.size<10*1024*1024){const ext=it.type.split('/')[1]||'png';savePastedBlob(s,e,blob,`image-${Date.now()}.${ext}`);return}}
  }
  // 3) 检查 text/plain 中的 data:image URL
  const tx=(ev.clipboardData?.getData('text/plain')||'').trim()
  if(tx.startsWith('data:image/')){pasteDataImage(s,e,tx);return}
  // 4) 纯文本
  replaceRange(s,e,tx);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=s+tx.length})}

let undoDebounce:ReturnType<typeof setTimeout>|null=null
function updateStats(text:string){wordCount.value=text.replace(/\s+/g,'').length;lineCount.value=text.split('\n').length;lineNumbers.value=Array.from({length:lineCount.value},(_,i)=>i+1)}function snapshot(clearRedo?:boolean){undoStack.push(content.value);if(undoStack.length>MAX_UNDO)undoStack.shift();if(clearRedo)redoStack.length=0}
function syncContent(){if(activeFile.value){content.value=activeFile.value.content;nextTick(()=>updateStats(content.value))}else{content.value='';wordCount.value=0;lineCount.value=0;lineNumbers.value=[]}}
function hi(e:Event){const v=(e.target as HTMLTextAreaElement).value;if(!undoDebounce){snapshot(true)}clearTimeout(undoDebounce);undoDebounce=setTimeout(()=>{undoDebounce=null},600);content.value=v;updateContent(v);updateStats(v)}
async function hs(){await saveFile(content.value)}

function hk(e:KeyboardEvent){const c=e.ctrlKey||e.metaKey
  if(c&&e.key==='s'){e.preventDefault();hs();return}
  if((c&&e.key==='f')||(c&&e.key==='h')){e.preventDefault();toggleSearch();return}
  if(c&&['0','1','2','3','4','5','6'].includes(e.key)){e.preventDefault();if(e.key==='0'){fmt.para();return}fmt.heading(parseInt(e.key));return}
  if(c&&!e.shiftKey&&e.key==='b'){e.preventDefault();fmt.bold();return}
  if(c&&!e.shiftKey&&e.key==='i'){e.preventDefault();fmt.italic();return}
  if(c&&e.shiftKey&&e.key==='K'){e.preventDefault();fmt.codeBlock();return}
  if(c&&e.shiftKey&&e.key==='T'){e.preventDefault();fmt.task();return}
  if(c&&e.shiftKey&&e.key==='E'){e.preventDefault();fmt.rmEmpty();return}
  if(c&&e.shiftKey&&e.key==='U'){e.preventDefault();fmt.ul();return}
  if(c&&e.shiftKey&&e.key==='O'){e.preventDefault();fmt.ol();return}
  if(c&&e.shiftKey&&e.key==='C'){e.preventDefault();clearFormat();return}
  if(c&&e.key==='d'&&!e.shiftKey){e.preventDefault();fmt.copyLine();return}
  if(c&&e.shiftKey&&e.key==='D'){e.preventDefault();fmt.rmDup();return}
  if(c&&e.shiftKey&&e.key==='S'){e.preventDefault();fmt.strike();return}
  if(c&&e.key==='`'){e.preventDefault();fmt.code();return}
  if(c&&!e.shiftKey&&e.key==='k'){e.preventDefault();fmt.link();return}
  if(c&&e.shiftKey&&e.key==='I'){e.preventDefault();fmt.image();return}
  if(c&&e.shiftKey&&e.key==='M'){e.preventDefault();fmt.formula();return}
  if(c&&e.shiftKey&&e.key==='H'){e.preventDefault();fmt.hr();return}
  if(c&&e.shiftKey&&e.key==='Q'){e.preventDefault();fmt.quote();return}
  if(c&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo();return}
  if(c&&e.key==='z'&&e.shiftKey){e.preventDefault();redo();return}
  if(c&&e.key==='y'){e.preventDefault();redo();return}
  if(e.key==='Tab'){e.preventDefault();const t=getTa();if(!t)return;const s=t.selectionStart,en=t.selectionEnd
    if(e.shiftKey){const ls=content.value.lastIndexOf('\n',s-1)+1;const ln=content.value.substring(ls,en);const nl=ln.replace(/^(\s{0,2})/,'');replaceRange(ls,en,nl);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=ls+(s-ls-(ln.length-nl.length))})}
    else{if(s===en){const nv=content.value.substring(0,s)+'  '+content.value.substring(en);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=s+2})}else{insertAtCursor('  ')}}
    return}
  if(e.key==='Enter'&&!e.shiftKey&&!c){const t=getTa();if(!t)return;const st=t.selectionStart;const ls=content.value.lastIndexOf('\n',st-1)+1;const cl=content.value.substring(ls,st)
    const ol=cl.match(/^(\d+)\.\s(.*)$/);if(ol){e.preventDefault();const n=parseInt(ol[1]),r=ol[2];if(r.trim()===''){const nv=content.value.substring(0,ls)+content.value.substring(st);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=ls})}else{const nn=n+1;const nv=content.value.substring(0,st)+'\n'+nn+'. '+content.value.substring(st);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});const p=st+1+String(nn).length+2;t.selectionStart=t.selectionEnd=p})};return}
    const ul=cl.match(/^([\s]*[-*+])\s(.*)$/);if(ul){e.preventDefault();const p=ul[1],r=ul[2];if(r.trim()===''){const nv=content.value.substring(0,ls)+content.value.substring(st);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=ls})}else{const nv=content.value.substring(0,st)+'\n'+p+' '+content.value.substring(st);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});const p2=st+1+p.length+1;t.selectionStart=t.selectionEnd=p2})};return}
    const qt=cl.match(/^>\s(.*)$/);if(qt){e.preventDefault();const r=qt[1];if(r.trim()===''){const nv=content.value.substring(0,ls)+content.value.substring(st);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=ls})}else{const nv=content.value.substring(0,st)+'\n> '+content.value.substring(st);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=st+3})};return}
    const tk=cl.match(/^(\s*[-*+]\s\[[ x]\])\s(.*)$/);if(tk){e.preventDefault();const p=tk[1],r=tk[2];if(r.trim()===''){const nv=content.value.substring(0,ls)+content.value.substring(st);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});t.selectionStart=t.selectionEnd=ls})}else{const nv=content.value.substring(0,st)+'\n'+p+' '+content.value.substring(st);content.value=nv;updateContent(nv);updateStats(nv);nextTick(()=>{t.focus({preventScroll:true});const p2=st+1+p.length+1;t.selectionStart=t.selectionEnd=p2})};return}
  }
}
function hs2(){if(isLocked())return;const t=textareaRef.value;if(!t)return;const el=t.closest('.editor-panel')?.querySelector('.lns');if(el)el.scrollTop=t.scrollTop;const ratio=t.scrollTop/(t.scrollHeight-t.clientHeight||1);setEditorScrollRatio(ratio)}

// 同步左侧编辑器：监听 composable 状态变化（预览编辑同步回来）
watch(()=>activeFile.value?.content,(nc)=>{if(nc!==undefined&&nc!==content.value){content.value=nc;nextTick(()=>updateStats(content.value))}})

watch(activeFileId,()=>{syncContent();sq.value='';sma.value=[];showSearch.value=false})
syncContent()

// 预览滚动 → 编辑器跟随（watch reactive ref）
watch(previewScrollRatio,(r)=>{if(isLocked()||!textareaRef.value)return;const t=textareaRef.value;lockScroll();t.scrollTop=r*(t.scrollHeight-t.clientHeight||1)})

// 大纲点击回调
onHeadingJump((anchorId)=>{
  if(!textareaRef.value)return
  const lines=content.value.split('\n')
  for(let i=0;i<lines.length;i++){const m=lines[i].match(/^#{1,6}\s+(.+)$/);if(m){const h=m[1].toLowerCase().replace(/\s+/g,'-').replace(/[^\w\u4e00-\u9fff-]/g,'');if(h===anchorId){const t=textareaRef.value
    // 滚动到标题行
    t.scrollTop=Math.max(0,i*22-100)
    break}}}
})

// ========== 撤销/重做 ==========
const undoStack:string[]=[];const redoStack:string[]=[];const MAX_UNDO=50
function saveUndo(){snapshot(false)}
function undo(){if(!undoStack.length)return;clearTimeout(undoDebounce);undoDebounce=null;redoStack.push(content.value);const p=undoStack.pop()!;content.value=p;updateContent(p);updateStats(p)}
function redo(){if(!redoStack.length)return;clearTimeout(undoDebounce);undoDebounce=null;undoStack.push(content.value);const n=redoStack.pop()!;content.value=n;updateContent(n);updateStats(n)}

// ========== 清除样式 ==========
function clearFormat(){const sel=getSel();if(!sel||sel.s===sel.e)return;let t=content.value.substring(sel.s,sel.e)
  t=t.replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1').replace(/~~(.+?)~~/g,'$1').replace(/`(.+?)`/g,'$1').replace(/\[(.+?)\]\(.+?\)/g,'$1').replace(/!\[(.+?)\]\(.+?\)/g,'$1')
  replaceRange(sel.s,sel.e,t)}

function handleFileCmd(cmd:string){const t=getTa();if(!t)return
  switch(cmd){
    case'save-as':{
      const file=activeFile.value
      if(!file)return
      window.electronAPI?.saveAs(file.name, file.content).then(newPath=>{
        if(newPath)ElMessage.success(`已另存为：${newPath.split('\\').pop()}`)
      })
      break
    }
    case'new-window':window.electronAPI?.createWindow();break
    case'open':window.electronAPI?.openFileDialog().then(fp=>{if(fp)loadFileFromPath(fp)});break
    case'open-folder':window.electronAPI?.selectDirectory().then(d=>{if(d)switchWorkspace(d)});break
    case'open-location':if(activeFile.value?.path)window.electronAPI?.showInFolder(activeFile.value.path);break
    case'export:html':emit('export','html');break
    case'export:pdf':emit('export','pdf');break
    case'export:png':emit('export','png');break
    case'export:last':emit('export-last');break
    case'export:last-ov':emit('export-last',true);break
  }
}

const codeLangs=['javascript','typescript','python','java','c','cpp','go','rust','sql','html','css','bash','json','yaml','xml','shell','mermaid']
</script>

<template>
<div class="editor-panel">
  <div v-if="showSearch" class="srch">
    <div class="srch-row">
      <el-input id="es" :model-value="sq" size="small" placeholder="查找..." clearable @input="onSearchChange" @keydown.enter.prevent="nx" @keydown.shift.enter.prevent="pv">
        <template #prefix><span>🔍</span></template>
        <template #suffix><span class="srch-n">{{ sma.length?smi+1:0 }}/{{ sma.length }}</span></template>
      </el-input>
      <div class="srch-a"><el-button size="small" text @mousedown.prevent="pv" :disabled="!sma.length">▲</el-button><el-button size="small" text @mousedown.prevent="nx" :disabled="!sma.length">▼</el-button></div>
      <el-button size="small" text @mousedown.prevent="toggleSearch">✕</el-button>
    </div>
    <div class="srch-row" style="margin-top:4px">
      <el-input :model-value="replaceText" size="small" placeholder="替换为..." clearable style="flex:1" @input="(v:string)=>replaceText=v" @keydown.enter.prevent="replaceOne"></el-input>
      <el-button size="small" text @mousedown.prevent="replaceOne" :disabled="!sma.length" style="margin-left:4px">替换</el-button>
      <el-button size="small" text @mousedown.prevent="replaceAll" :disabled="!sma.length" style="margin-left:2px">一键替换</el-button>
    </div>
  </div>

  <div class="tb" @mousedown.capture="saveSel">
    <el-dropdown trigger="click" @command="handleFileCmd" @visible-change="onMenuChange">
      <el-button size="small" text class="tb-btn">文件 ▾</el-button>
      <template #dropdown><el-dropdown-menu>
        <el-dropdown-item command="save-as">💾 另存为</el-dropdown-item>
        <el-dropdown-item command="new-window">🪟 新建窗口</el-dropdown-item>
        <el-dropdown-item divided command="open">📄 打开文件</el-dropdown-item>
        <el-dropdown-item command="open-folder">📂 打开文件夹</el-dropdown-item>
        <el-dropdown-item command="open-location">📍 打开文件位置</el-dropdown-item>
        <!-- 导出区（自定义 div，不经过 el-dropdown-item 事件系统） -->
        <div class="ctxm__d"></div>
        <div class="custom-export-header">📥 导出文档</div>
        <div class="custom-export-item" @click.stop="handleFileCmd('export:html')"><span>🌐 导出 HTML</span><span class="export-kbd">Ctrl+Shift+H</span></div>
        <div class="custom-export-item" @click.stop="handleFileCmd('export:pdf')"><span>📄 导出 PDF</span><span class="export-kbd">Ctrl+Shift+P</span></div>
        <div class="custom-export-item" @click.stop="handleFileCmd('export:png')"><span>🖼️ 导出图像</span><span class="export-kbd">Ctrl+Shift+G</span></div>
        <div class="custom-export-divider"></div>
        <div class="custom-export-item" @click.stop="handleFileCmd('export:last')"><span>⚡ 上次设置导出</span><span class="export-kbd">Ctrl+Shift+E</span></div>
        <div class="custom-export-item" @click.stop="handleFileCmd('export:last-ov')"><span>🔄 覆盖上次导出</span><span class="export-kbd">Ctrl+Shift+O</span></div>
      </el-dropdown-menu></template>
    </el-dropdown>

    <el-dropdown trigger="click" @command="(v:string)=>{if(v==='tbl')fmt.table();else if(v==='codeblock'){fmt.codeBlock();}else fmt[v]?.();nextTick(()=>getTa()?.focus({preventScroll:true}))}" @visible-change="(v:boolean)=>{if(!v)nextTick(()=>getTa()?.focus({preventScroll:true}))}">
      <el-button size="small" text class="tb-btn">插入 ▾</el-button>
      <template #dropdown><el-dropdown-menu>
        <el-dropdown-item command="bold">加粗 (Ctrl+B)</el-dropdown-item>
        <el-dropdown-item command="italic">斜体 (Ctrl+I)</el-dropdown-item>
        <el-dropdown-item command="strike">删除线 (Ctrl+Shift+S)</el-dropdown-item>
        <el-dropdown-item command="code">行内代码 (Ctrl+`)</el-dropdown-item>
        <el-dropdown-item divided command="codeblock">💻 代码块 (Ctrl+Shift+K)</el-dropdown-item>
        <el-dropdown-item divided command="link">🔗 链接 (Ctrl+K)</el-dropdown-item>
        <el-dropdown-item command="image">🖼 图片 (Ctrl+Shift+I)</el-dropdown-item>
        <el-dropdown-item command="formula">∑ 公式 (Ctrl+Shift+M)</el-dropdown-item>
        <el-dropdown-item command="hr">— 分割线 (Ctrl+Shift+H)</el-dropdown-item>
      </el-dropdown-menu></template>
    </el-dropdown>

    <el-dropdown trigger="click" @command="(v:string)=>{fmt.codeBlock(v);nextTick(()=>getTa()?.focus({preventScroll:true}))}" @visible-change="onMenuChange">
      <el-button size="small" text class="tb-btn">代码块 ▾</el-button>
      <template #dropdown><el-dropdown-menu class="code-lang-menu">
        <el-dropdown-item v-for="l in codeLangs" :key="l" :command="l">{{ l }}</el-dropdown-item>
      </el-dropdown-menu></template>
    </el-dropdown>

    <el-dropdown trigger="click" @command="(v:string)=>{if(v==='h')fmt.para();else fmt.heading(v);nextTick(()=>getTa()?.focus({preventScroll:true}))}" @visible-change="onMenuChange">
      <el-button size="small" text class="tb-btn">格式 ▾</el-button>
      <template #dropdown><el-dropdown-menu>
        <el-dropdown-item command="1">标题 1 (Ctrl+1)</el-dropdown-item>
        <el-dropdown-item command="2">标题 2 (Ctrl+2)</el-dropdown-item>
        <el-dropdown-item command="3">标题 3 (Ctrl+3)</el-dropdown-item>
        <el-dropdown-item command="4">标题 4 (Ctrl+4)</el-dropdown-item>
        <el-dropdown-item command="5">标题 5 (Ctrl+5)</el-dropdown-item>
        <el-dropdown-item command="6">标题 6 (Ctrl+6)</el-dropdown-item>
        <el-dropdown-item divided command="h">段落 (Ctrl+0)</el-dropdown-item>
      </el-dropdown-menu></template>
    </el-dropdown>

    <el-dropdown trigger="click" @command="(v:string)=>{(fmt as any)[v]?.();nextTick(()=>getTa()?.focus({preventScroll:true}))}" @visible-change="onMenuChange">
      <el-button size="small" text class="tb-btn">列表 ▾</el-button>
      <template #dropdown><el-dropdown-menu>
        <el-dropdown-item command="ul">• 无序列表 (Ctrl+Shift+U)</el-dropdown-item>
        <el-dropdown-item command="ol">1. 有序列表 (Ctrl+Shift+O)</el-dropdown-item>
        <el-dropdown-item command="task">☑ 任务 (Ctrl+Shift+T)</el-dropdown-item>
        <el-dropdown-item command="quote">❝ 引用 (Ctrl+Shift+Q)</el-dropdown-item>
      </el-dropdown-menu></template>
    </el-dropdown>

    <el-dropdown trigger="click" @command="(v:string)=>{if(v==='in-tbl')fmt.table();else fmt.tableOp(v);nextTick(()=>getTa()?.focus({preventScroll:true}))}" @visible-change="onMenuChange">
      <el-button size="small" text class="tb-btn">⊞ 表格 ▾</el-button>
      <template #dropdown><el-dropdown-menu>
        <el-dropdown-item command="in-tbl">⊞ 插入表格</el-dropdown-item>
        <el-dropdown-item divided command="row-above">▲ 上方插入行</el-dropdown-item>
        <el-dropdown-item command="row-below">▼ 下方插入行</el-dropdown-item>
        <el-dropdown-item command="col-left">◀ 左侧插入列</el-dropdown-item>
        <el-dropdown-item command="col-right">▶ 右侧插入列</el-dropdown-item>
        <el-dropdown-item divided command="row-up">↑ 上移该行</el-dropdown-item>
        <el-dropdown-item command="row-down">↓ 下移该行</el-dropdown-item>
        <el-dropdown-item command="del-row">✕ 删除行</el-dropdown-item>
        <el-dropdown-item command="del-col">✕ 删除列</el-dropdown-item>
        <el-dropdown-item divided command="copy-table">📋 复制表格</el-dropdown-item>
        <el-dropdown-item command="del-table">🗑 删除表格</el-dropdown-item>
      </el-dropdown-menu></template>
    </el-dropdown>

    <el-dropdown trigger="click" @command="(v:string)=>{if(v==='srch'){toggleSearch();return}if(v==='theme'){toggleTheme();return}if(v==='undo'){undo();nextTick(()=>getTa()?.focus({preventScroll:true}));return}if(v==='redo'){redo();nextTick(()=>getTa()?.focus({preventScroll:true}));return}if(v==='clearFmt'){clearFormat();nextTick(()=>getTa()?.focus({preventScroll:true}));return}fmt[v]?.();nextTick(()=>getTa()?.focus({preventScroll:true}))}" @visible-change="onMenuChange">
      <el-button size="small" text class="tb-btn">工具 ▾</el-button>
      <template #dropdown><el-dropdown-menu>
        <el-dropdown-item command="theme">{{ theme === 'dark' ? '☀️ 浅色主题' : '🌙 深色主题' }}</el-dropdown-item>
        <el-dropdown-item divided command="srch">🔍 查找 (Ctrl+F)</el-dropdown-item>
        <el-dropdown-item divided command="undo">撤销 (Ctrl+Z)</el-dropdown-item>
        <el-dropdown-item command="redo">重做 (Ctrl+Y)</el-dropdown-item>
        <el-dropdown-item command="clearFmt">清除样式 (Ctrl+Shift+C)</el-dropdown-item>
        <el-dropdown-item divided command="rmEmpty">移除空行 (Ctrl+Shift+E)</el-dropdown-item>
        <el-dropdown-item command="rmDup">删除重复行 (Ctrl+Shift+D)</el-dropdown-item>
        <el-dropdown-item command="markDup">标记重复行</el-dropdown-item>
        <el-dropdown-item command="copyLine">复制行 (Ctrl+D)</el-dropdown-item>
      </el-dropdown-menu></template>
    </el-dropdown>
  </div>

  <Teleport to="body">
    <div v-if="cx" class="ctxm" :class="{'ctxm--up':ctxUp}" :style="{left:cxx+'px',top:cxy+'px'}" @mouseleave="actSub=''">
      <template v-for="item in ci" :key="item.ac||item.label">
        <div v-if="item.div" class="ctxm__d"/>
        <div v-else-if="item.ch" class="ctxm__i" @mouseenter="onSubEnter(item.label||'')" @mouseleave="onSubLeave(item.label||'')" @click="actSub=actSub===item.label?'':item.label">
          <span>{{item.label}}</span><span class="ctxm__ar">▶</span>
          <div v-if="actSub===item.label" class="ctxm__sub">
            <div v-for="ch in item.ch" :key="ch.ac" class="ctxm__i" @click.stop="ca(ch.ac||'')">
              <span>{{ch.label}}</span><span class="ctxm__sc">{{ch.sc}}</span>
            </div>
          </div>
        </div>
        <div v-else class="ctxm__i" @click="ca(item.ac||'')">
          <span>{{item.label}}</span><span class="ctxm__sc">{{item.sc}}</span>
        </div>
      </template>
    </div>
  </Teleport>

  <div class="hdr">
    <div class="hdr-l"><el-icon><EditPen/></el-icon><span class="hdr-fn">{{activeFile?.name||'未选择文件'}}</span><span v-if="dirty" class="hdr-d">● 未保存</span></div>
    <div class="hdr-r"><span class="hdr-st">{{wordCount}}字 | {{lineCount}}行</span><el-button type="primary" size="small" :disabled="!activeFile" @click="hs">💾 保存</el-button></div>
  </div>

  <div class="body">
    <div class="lns"><div v-for="n in lineNumbers" :key="n" class="ln">{{n}}</div></div>
    <textarea ref="textareaRef" v-model="content" class="ta" :placeholder="activeFile?'在此输入 Markdown 内容...':'请先选择或创建一个文件'" :disabled="!activeFile" spellcheck="false"
      @input="hi" @keydown="hk" @scroll="hs2" @paste="hp" @contextmenu="sc" @blur="onTextareaBlur" @focus="onTextareaFocus"/>
  </div>

  <div class="ft">
    <span>Markdown</span>
    <div class="ft-sc"><span>Ctrl+N 新建</span><span>Ctrl+S 保存</span><span>Ctrl+F 查找</span><span>Ctrl+D 复制行</span></div>
  </div>
</div>
</template>

<style scoped lang="scss">
.editor-panel{display:flex;flex-direction:column;height:100%;background:var(--surface)}
.srch{padding:6px 16px;background:var(--bg);border-bottom:1px solid var(--divider)}
.srch-row{display:flex;align-items:center;gap:4px}:deep(.srch-row .el-input){flex:1;max-width:280px}
.srch-n{font-size:11px;color:var(--text-hint);white-space:nowrap}.srch-a{display:flex;gap:2px}
.tb{display:flex;align-items:center;gap:0;padding:0 12px;height:40px;background:var(--sidebar-bg);border-bottom:1px solid var(--divider)}
.tb-btn{font-size:12px;padding:6px 10px;height:30px;color:var(--text-secondary);letter-spacing:.3px;border-radius:4px;margin:0 1px;transition:all .15s;font-weight:500;user-select:none;line-height:1;
  &:hover{background:var(--hover);color:var(--primary)}}
.tb-btn:active,.tb-btn:focus{outline:none;background:var(--active)}
:deep(.code-lang-menu){max-height:300px;overflow-y:auto}
.ctxm{position:fixed;z-index:9999;min-width:190px;background:var(--surface);border:1px solid var(--divider);border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.12);padding:4px 0;user-select:none;animation:fadeIn .12s ease}
@keyframes fadeIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.ctxm__i{display:flex;align-items:center;justify-content:space-between;padding:6px 14px;font-size:13px;color:var(--text-primary);cursor:pointer;position:relative;transition:background .1s;
  &:hover{background:var(--primary-container);color:var(--primary)}}
.ctxm__sc{font-size:11px;color:var(--text-hint);margin-left:20px}
.ctxm__ar{font-size:10px;color:var(--text-hint);margin-left:12px}
.ctxm__d{height:1px;background:var(--divider);margin:3px 8px}
.ctxm__sub{position:absolute;left:100%;min-width:190px;background:var(--surface);border:1px solid var(--divider);border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.12);padding:4px 0;z-index:10000;animation:fadeIn .1s ease}
.ctxm--up .ctxm__sub{top:auto;bottom:0}
.ctxm:not(.ctxm--up) .ctxm__sub{top:-4px;bottom:auto}
.hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;height:48px;border-bottom:1px solid var(--divider)}
.hdr-l{display:flex;align-items:center;gap:8px;color:var(--text-secondary);min-width:0}
.hdr-fn{font-size:14px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hdr-d{font-size:12px;color:#f59e0b}
.hdr-r{display:flex;align-items:center;gap:12px}.hdr-st{font-size:12px;color:var(--text-hint)}
.body{flex:1;display:flex;overflow:hidden}
.lns{width:calc(44px * var(--zoom-scale, 1));padding:calc(16px * var(--zoom-scale, 1)) 0;overflow:hidden;text-align:right;background:var(--bg);border-right:1px solid var(--divider);user-select:none}
.ln{height:calc(22px * var(--zoom-scale, 1));line-height:calc(22px * var(--zoom-scale, 1));padding-right:calc(8px * var(--zoom-scale, 1));font-family:$font-family-mono;font-size:calc(12px * var(--zoom-scale, 1));color:var(--text-hint)}
.ta{flex:1;padding:calc(16px * var(--zoom-scale, 1));border:none;outline:none;resize:none;font-family:$font-family-mono;font-size:calc(14px * var(--zoom-scale, 1));line-height:1.6;color:var(--text-primary);background:var(--surface);tab-size:2;overflow-y:auto;&::placeholder{color:var(--text-hint)}&:disabled{cursor:not-allowed;opacity:.6}}
.ft{display:flex;align-items:center;justify-content:space-between;padding:4px 16px;height:28px;font-size:12px;color:var(--text-hint);border-top:1px solid var(--divider);background:var(--sidebar-bg)}
.ft-sc{display:flex;gap:14px}
@media(max-width:1100px){.tb{padding:4px 6px}.tb-btn{font-size:11px;padding:3px 8px}.hdr-st{display:none}}
@media(max-width:900px){.ft-sc{display:none}.lns{width:32px}.ta{padding:12px}}
.custom-export-header {
  padding: 5px 14px; font-size: 12px; color: var(--text-hint);
  display: flex; align-items: center; gap: 4px; user-select: none;
}
.custom-export-item {
  padding: 5px 14px; font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between;
  &:hover { background: var(--primary-container); color: var(--primary); }
}
.export-kbd { font-size: 11px; color: var(--text-hint); margin-left: 16px; white-space: nowrap; }
.custom-export-divider { height: 1px; background: var(--divider); margin: 3px 8px; }
</style>