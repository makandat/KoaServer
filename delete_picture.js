// pictures.db/pixiv で fav < 0 である項目を削除する。もし、その項目がディスク上に存在する場合は、そのフォルダも削除する。
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import readline from 'readline'

// fav < 0 である項目を削除する。
async function delete_fav_minus() {
  const db = new Database('./pictures.db')
  // fav < 0 であるレコードを得る。
  const rows = await db.prepare('SELECT id, path FROM pixiv WHERE fav < 0').all()
  // fav < 0 であるレコードがあるか？
  if (rows) {
    for (const row of rows) {
      // ディスク上のフォルダを削除
      await fs.promises.rm(row.path, { recursive: true, force: true })
      console.log(row.path)
      // pixiv_ex テーブルのデータを削除
      await db.prepare('DELETE FROM pixiv_ex WHERE id = ' + row.id).run()
    }
    // pixiv テーブルのデータを削除
    await db.prepare('DELETE FROM pixiv WHERE fav < 0').run()
    return rows.length
  }
  else {
    return 0
  }
}

// 文字列を入力する。
function questionPromise(rl, query) {
  return new Promise((resolve) => {
    // questionメソッドはユーザー入力を受け取った後、コールバックを実行する
    rl.question(query, (answer) => {
      // コールバック内で Promise を解決 (resolve) する
      resolve(answer);
    })
  })
}

// 開始位置
console.info('pictures.db/pixiv テーブルの fav < 0 である項目を削除する。もし、その項目がディスク上に存在する場合は、そのフォルダも削除する。')
// readline インタフェースを作成
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})
try {
  const answer = await questionPromise(rl, '実行しますか? (y/n): ')
  if (answer != 'y') {
    consolr.info('実行を中止しました。')
    process.exit(9)
  }
  else {
    const n = await delete_fav_minus()
    console.info('完了しました。(' + n + ' 件の項目を削除)')
  }
}
catch (e) {
  console.error('エラーを検出: ', e)
}
finally {
  rl.close()
}
