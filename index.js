/* index.js : pictures.db を使った画像フォルダ管理 */
/*   Version 1.3.0 
  1 セッション mark, filter の追加
  2 vw_pictures が pixiv_ex テーブルの内容が pictures テーブルと一致しないとき、すべての項目が含まれないのを修正
  3 画像表示の位置表示がずれているのを修正
*/
const PORT = 3030
const DBPATH = './pictures.db'

// ES Module 形式でのインポート
import Koa from 'koa'
import fs from 'fs'
import path from 'path'
import session from 'koa-session' // router より前に import すること
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import serve from 'koa-static'
import views from 'koa-views'
import Pixiv from './Pixiv.js'
import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

// Koa アプリケーションの作成
const app = new Koa()
// ルーターの作成
const router = new Router()
// データベース接続の初期化
const pixiv = new Pixiv(DBPATH)
// セッション
app.keys = ['makandat-koa-session-order-by-secret-key'];
app.use(session(app));

// package,json を読む。
function reafPackageJson() {
  const json = fs.readFileSync('./package.json', 'utf8')
  return JSON.parse(json)
}

// フォルダ内の画像ファイル一覧を得る。
async function get_files(dir) {
  let files = await readdir(dir)
  files = files.filter(file => /\.(jpg|jpeg|png|gif)$/.test(file)).map(file => path.join(dir, file))
  if (process.platform == 'win32') {
    for (let i in files) {
      files[i] = files[i].replaceAll('\\', '/')
    }
  }
  return files
}

// フォルダ内の最初のファイルを得る。
async function get_first_file(dir) {
  const files = await get_files(dir)
  return files.length > 0 ? files[0] : null
}

// フォリダ内の最後のファイルを得る。
async function get_last_file(dir) {
  const files = await get_files(dir)
  return files.length > 0 ? files[files.length - 1] : null
}

// フォルダ内の指定したファイルの次のファイルを得る。
async function get_next_file(dir, currentFile) {
  const files = await get_files(dir)
  const index = files.indexOf(currentFile)
  return index >= 0 && index < files.length - 1 ? files[index + 1] : null
}

// フォルダ内の指定したファイルの前のファイルを得る。
async function get_prev_file(dir, currentFile) {
  const files = await get_files(dir)
  const index = files.indexOf(currentFile)
  return index > 0 ? files[index - 1] : null
}

// フォルダ内のファイル位置を得る。
async function get_file_position(dir, currentFile) {
  const files = await get_files(dir)
  const index = files.indexOf(currentFile)
  return index >= 0 ? index : -1
}

// フォルダ内のファイル数を得る。
async function get_file_count(dir) {
  const files = await get_files(dir)
  return files.length
}

// ディレクトリ名の最後が '/' または '\' の場合は削除
function normalizeDir(dir) {
  if (dir.endsWith('/') || dir.endsWith('\\')) {
    return dir.slice(0, -1);
  }
  return dir;
}

// pixiv.count を増やす。
async function count_up(id) {
  await pixiv.count_update(id)
}

// ビューファイルのディレクトリと使用するテンプレートエンジンを設定
app.use(views(path.join(path.dirname("."), 'views'), {
  extension: 'ejs'
}))

// ボディパーサを使用
app.use(bodyParser())


// --- 1. 基本的なルート定義 ---

// ルートパス ('/') への GET リクエスト
router.get('/', async (ctx) => {
  let message = '';
  if (pixiv.check_ex_count() == false) {
    message = 'pictures と pictures_ex テーブルの整合性が取れていません。「リフレッシュ」を実行してください。'
  }
  const conf = reafPackageJson()
  const title = conf.name + " " + conf.version;
  ctx.session.orderby = ctx.session.orderby || 'asc'
  ctx.session.mark = ''
  ctx.session.filter = ''
  let sql = "SELECT * FROM vw_pictures ORDER BY id"
  switch (ctx.query.order) {
    case 'desc':
      sql += " DESC"
      ctx.session.orderby = 'desc'
      break;
    case 'title':
      sql = "SELECT * FROM vw_pictures ORDER BY title"
      break;
    default:
      if (ctx.session.orderby === 'asc')
        sql += " ASC"
      else
        sql += " DESC"
      break
  }
  const data = await pixiv.query(sql)
  let marks = await pixiv.list_marks()
  marks = marks.map(mark => mark.mark)

  // 'index.ejs'をレンダリングし、変数を渡す
  await ctx.render('index', {
    title: title,
    message: message,
    marks: marks,
    data: data
  });
});

// pixiv_ex テーブルのリフレッシュ
router.get('/refresh_ex', async (ctx) => {
  const conf = reafPackageJson()
  const title = conf.name + " " + conf.version
  let refresh_id = 0
  if (conf.refresh_id != undefined)
    refresh_id = conf.refresh_id
  let marks = await pixiv.list_marks()
  marks = marks.map(mark => mark.mark)
  try {
    await pixiv.refresh_pixiv_ex()
    const sql = `SELECT * FROM vw_pictures WHERE id >= ${refresh_id} ORDER BY id`
    const data = await pixiv.query(sql)
    await ctx.render('index', {
      title:title,
      message: 'pixiv_ex テーブルのリフレッシュが完了しました。',
      data:data,
      marks:marks
    })
  }
  catch (e) {
    await ctx.render('errorpage', {message: 'エラーが発生しました。' + e})
  }
});

// 項目の追加ページ
router.get('/additem', async (ctx) => {
  const data = {id:'', title: '', creator: '', path: '', media: '', mark: '', fav: 0, info: ''};
  try {
    await ctx.render('additem', {data: data, message: ''})
  }
  catch (e) {
    await ctx.render('errorpage', {message: 'エラーが発生しました。' + e})
  }
});

// POST 項目の追加
router.post('/additem', async (ctx) => {
  try {
    const data = ctx.request.body
    if (existsSync(data.path) == false) {
      await ctx.render('errorpage', {message: `指定されたパス "${data.path}" は存在しません。`})
      return
    }
    else {
      if (process.platform === 'win32') {
        data.path = data.path.replaceAll('\\', '/'); // Windowsのパス区切
      }
      data.path = normalizeDir(data.path)
      // すでに path が登録されているかチェックする。
      let row = await pixiv.get_path(data.path)
      if (row) {
        await ctx.render('errorpage', {message: `パス ${data.path} はすでに登録されています。id=${row.id} title="${row.title}"`})
        return
      }
      data.title = data.title.trim()
      data.info = data.info.trim()
      await pixiv.insert(data)
      const max_id = await pixiv.get_maxid()
      await pixiv.update_pixiv_ex(max_id)
      await ctx.render('additem', {
        data: data,
        message: `id=${max_id}: "${data.title}" が追加されました。一覧表示は自動で更新されないのでリロードしてください。`
      })
    }
  }
  catch (e) {
    await ctx.render('errorpage', {message: 'エラーが発生しました。'})
  }
})

// 項目の更新
router.get('/updateitem/:id', async (ctx) => {
  const id = ctx.params.id;
  const data = await pixiv.get_id(id, true);
  const title = `Pictures - ${id}`;
  await ctx.render('updateitem', {
    title: title,
    message: '',
    data: data
  })
})

// POST 項目の更新
router.post('/updateitem', async (ctx) => {
  const data = ctx.request.body;
  const id = data.id;
  if (process.platform === 'win32') {
    data.path = data.path.replaceAll('\\', '/'); // Windowsのパス区切り文字を変換
  }
  data.path = normalizeDir(data.path)
  data.title = data.title.trim()
  data.info = data.info.trim()
  await pixiv.update(id, data);
  await ctx.render('updateitem', {
    message: `id = ${id} のデータがが更新されました。一覧表示は自動で更新されないのでリロードしてください。`,
    data: data
  })
});

// 項目の全体表示
router.get('/showall/:id', async (ctx) => {
  const id = ctx.params.id
  const order = ctx.query.order || 'asc';
  const row = await pixiv.get_id(id)
  if (row) {
    const title = row.title
    const images = await get_files(row.path)
    if (order === 'desc') {
      images.reverse();
    }
    await count_up(id)
    const subtitle = `ファイル数: ${images.length} 場所: ${row.path}`;
    await ctx.render('showall', {
      id: id,
      title: title,
      subtitle: subtitle,
      images: images
    });
  }
});

// 画像を返す。
router.get('/image', async (ctx) => {
  const imagePath = ctx.query.path;
  if (!imagePath || !fs.existsSync(imagePath)) {
    ctx.status = 404;
    ctx.body = '画像が見つかりません';
    return;
  }
  ctx.type = path.extname(imagePath); // 拡張子からMIMEタイプを自動設定
  ctx.body = fs.createReadStream(imagePath);
});

// 項目のサムネール表示
router.get('/thumbs/:id', async (ctx) => {
  const id = ctx.params.id;
  const row = await pixiv.get_id(id, true);
  if (row) {
    await count_up(id)
    const title = row.title;
    const subtitle = `ファイル数: ${row.file_count} 場所: ${row.path}`;
    const images = await get_files(row.path);
    await ctx.render('thumb', {
      title: title,
      subtitle: subtitle,
      images: images
    });
  }
});

// 画像を１つ表示する
router.get('/showone', async (ctx) => {
  let imagePath = ctx.query.path;
  const dir = path.dirname(imagePath)
  const count = await get_file_count(dir)
  const move = ctx.query.move || ''
  if (!imagePath || !fs.existsSync(imagePath)) {
    await ctx.render('errorpage', { message: '画像が見つかりません' });
    return;
  }
  let message = ""
  const imagePath2 = imagePath
  switch (move) {
    case 'prev':
      imagePath = await get_prev_file(dir, imagePath);
      if (imagePath == null) {
        imagePath = imagePath2
        message = "最初の画像です。"
      }
      break;
    case 'next':
      imagePath = await get_next_file(dir, imagePath);
      if (imagePath == null) {
        imagePath = imagePath2
        message = "最後の画像です。"
      }
      break;
    case 'last':
      imagePath = await get_last_file(dir);
      break;
    case 'first':
      imagePath = await get_first_file(dir);
    default:
      break
  }
  const position = await get_file_position(dir, imagePath)
  const row = await pixiv.get_path(dir);
  const title = row.title
  await ctx.render('showone', { title: title, message: message, count: count, path: imagePath, position: position });
});

// 作者によるクエリ
router.get('/query_creator', async (ctx) => {
  const creator = ctx.query.creator;
  const data = await pixiv.query_by_creator(creator, true);
  let marks = await pixiv.list_marks()
  marks = marks.map(mark => mark.mark)
  const title = `Pictures - ${creator}`;
  await ctx.render('index', {
    title: title,
    message: '作者: ' + creator,
    data: data,
    marks: marks
  });
});

// マークによるクエリ
router.get('/query_mark', async (ctx) => {
  const mark = ctx.query.mark;
  const orderby = ctx.query.orderby || 'asc';
  ctx.session.mark = mark
  const data = await pixiv.query_by_mark(mark, orderby, true);
  let marks = await pixiv.list_marks()
  marks = marks.map(mark => mark.mark)
  const title = `Pictures - ${mark}`;
  await ctx.render('index', {
    title: title,
    message: 'マーク: ' + mark,
    marks: marks,
    data: data
  });
})

// フィルタによるクエリ
router.get('/query_by_filter', async (ctx) => {
  const filter = ctx.query.filter;
  const orderby = ctx.query.orderby || 'asc';
  ctx.session.filter = filter
  const data = await pixiv.query_by_filter(filter, orderby, true);
  let marks = await pixiv.list_marks()
  marks = marks.map(mark => mark.mark)
  const title = `Pictures - ${filter}`;
  await ctx.render('index', {
    title: title,
    message: 'フィルタ: ' + filter,
    data: data,
    marks: marks
  });
});

// お気に入り
router.get('/favorites', async (ctx) => {
  const data = await pixiv.query_by_fav(true);
  let marks = await pixiv.list_marks()
  marks = marks.map(mark => mark.mark)
  const title = `Pictures - お気に入り`;
  await ctx.render('index', {
    title: title,
    message: 'お気に入り',
    data: data,
    marks: marks
  });
});

// 作者一覧を表示する
router.get("/creators", async (ctx) => {
  const creators = await pixiv.list_creators();
  await ctx.render('creators', { creators: creators });
})

// 昇順と降順の設定
router.get('/orderby/:kind', async ctx => {
  const conf = reafPackageJson()
  const title = conf.name + " " + conf.version;
  const kind = ctx.request.params.kind
  let message = '降順で表示'
  if (kind == 'asc') {
    message = '昇順で表示'
  }
  const mark = ctx.session.mark
  const filter = ctx.session.filter
  let sql = 'SELECT * FROM vw_pictures ORDER BY id ' + kind
  let data = []
  if (mark != '') {
    data = await pixiv.query_by_mark(mark, kind, true)
  }
  else if (filter != '') {
    data = await pixiv.query_by_filter(filter, kind, true)
  }
  else {
    data = await pixiv.query(sql)
  }
  let marks = await pixiv.list_marks()
  marks = marks.map(mark => mark.mark)
  await ctx.render('index', {
    title: title,
    message: message,
    data: data,
    marks: marks
  });
})

// fav < 0 の項目を削除
router.get('/delete_by_fav', async (ctx) => {
  try {
    await pixiv.delete_negfav(false)
    const title = 'Pictures by Koa.js';
    const sql = "SELECT * FROM vw_pictures ORDER BY id"
    const data = await pixiv.query(sql)
    let marks = await pixiv.list_marks()
    marks = marks.map(mark => mark.mark)
    await ctx.render('index', {
      title:title,
      message: 'fav < 0 の項目を削除しました。',
      data:data,
      marks:marks
    })
  }
  catch (e) {
    await ctx.render('errorpage', {message: 'エラーが発生しました。' + e})
  }
})

// アクセスログをコンソールに表示
//   package.json の 'accesslog' を true にする必要がある。
app.use(async (ctx, next) => {
  const conf = reafPackageJson()
  if (conf.accesslog) {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${ctx.method} ${ctx.url} - ${start} - ${ms}ms`)
  }
  else
    await next()
})

// ルーターミドルウェアを Koa アプリケーションに追加
// .routes() でルーティングを有効化
app.use(router.routes());

// .allowedMethods() でオプションを設定
// これにより、許可されていないHTTPメソッド（例：GETのみ許可のルートにPUTでアクセス）が来た場合に、
// 適切なステータスコード（405 Method Not Allowed や 501 Not Implemented）を返すようにします。
app.use(router.allowedMethods());

// 'public'ディレクトリ内のファイルを静的ファイルとして公開
app.use(serve(path.join(path.dirname("."), 'public')))

// サーバーの起動
app.listen(PORT, () => {
  const conf = reafPackageJson()
  const title = `${conf.name} ${conf.version} - http://localhost:${PORT}`
  console.log(title)
})
