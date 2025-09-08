/* pictures.db pixiv テーブルの操作用クラス */
/*   class Pixiv v1.0.0 */
'use strict'
import Database from 'better-sqlite3' // https://www.npmjs.com/package/better-sqlite3
import { existsSync, rmSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises'
import { platform } from 'node:os';
import { join } from 'node:path'

export default class Pixiv {
  // コンストラクタ
  // dbpath はデータベースファイルのパス名
  constructor(dbpath) {
    this.db = new Database(dbpath);
  }

  // pixiv または vw_pictures に対して SQL クエリを実行する
  async query(sql, params = []) {
    return this.db.prepare(sql).all(params)
  }

  // pixiv または vw_pictures に対して SQL クエリを実行する。条件は filter で指定する。
  async query_filter(filter, ex=false) {
    let table = 'pixiv'
    if (ex) {
      table = 'vw_pictures'
    }
    const sql = `SELECT * FROM ${table} WHERE instr(title, ?) OR instr(path, ?) OR instr(info, ?)`
    return this.db.prepare(sql).all([filter, filter, filter])
  }
  
  // pixiv または vw_pictures に対して SQL クエリを実行する。条件は mark で指定する。
  async query_by_mark(mark, ex=false) {
    let table = 'pixiv'
    if (ex) {
      table = 'vw_pictures'
    }
    const sql = `SELECT * FROM ${table} WHERE mark = ?`
    return this.db.prepare(sql).all([mark])
  }

  // fav の降順で pixiv または vw_pictures に対して SQL クエリを実行する。
  async query_by_fav(ex=false) {
    let table = 'pixiv'
    if (ex) {
      table = 'vw_pictures'
    }
    const sql = `SELECT * FROM ${table} WHERE fav > 0 ORDER BY fav DESC`
    return this.db.prepare(sql).all()

  }

  // count の降順で pixiv または vw_pictures に対して SQL クエリを実行する。
  async query_by_count(ex=false) {
    let table = 'pixiv'
    if (ex) {
      table = 'vw_pictures'
    }
    const sql = `SELECT * FROM ${table} WHERE count > 0 ORDER BY count DESC`
    return this.db.prepare(sql).all()
  }

  // 作者によるクエリ
  async query_by_creator(creator, ex=false) {
    let table = 'pixiv'
    if (ex) {
      table = 'vw_pictures'
    }
    const sql = `SELECT * FROM ${table} WHERE creator = ?`
    return this.db.prepare(sql).all([creator])
  }

  // 指定した ID のデータを取得する。
  async get_id(id, ex=false) {
    let table = 'pixiv'
    if (ex) {
      table = 'vw_pictures'
    }
    const sql = `SELECT * FROM ${table} WHERE id = ?`
    return this.db.prepare(sql).get([id])
  }
  
  // id の最大値を得る。
  async get_maxid() {
    const sql = 'SELECT max(id) AS max_id FROM pixiv';
    return this.db.prepare(sql).get().max_id
  }

  // 指定したパスのデータを取得する。もし、pixiv テーブルに登録されていない場合は null を返す。
  async get_path(path, ex=false) {
    let table = 'pixiv'
    if (ex) {
      table = 'vw_pictures'
    }
    const sql = `SELECT * FROM ${table} WHERE path = ?`;
    return this.db.prepare(sql).get(path)
  }

  // 新しいデータを挿入する。
  async insert(data) {
    const sql = 'INSERT INTO pixiv (title, creator, path, media, mark, info, date) VALUES (?, ?, ?, ?, ?, ?, date())'
    const stmt = this.db.prepare(sql)
    stmt.run(data.title, data.creator, data.path, data.media, data.mark, data.info)
  }

  // データを更新する。
  async update(id, data) {
    const sql = 'UPDATE pixiv SET title=?, creator=?, path=?, media=?, mark=?, fav=?, info=? WHERE id = ?'
    const stmt = this.db.prepare(sql)
    stmt.run([data.title, data.creator, data.path, data.media, data.mark, data.fav, data.info, id]);
  }

  // 指定した id のデータを削除する。
  async delete(id) {
    const sql = 'DELETE FROM pixiv WHERE id = ?';
    const stmt = this.db.prepare(sql)
    stmt.run([id]);
  }

  // fav < 0 のレコードを削除する。
  // dataonly: false の場合、fav < 0 の物理的なパスも削除
  async delete_negfav(dataonly=true) {
    const sql = 'SELECT id FROM pixiv WHERE fav < 0';
    const ids = await this.db.prepare(sql).all()
    if (!dataonly) {
      // 物理的なパスを削除する処理
      for (const item of ids) {
        const path = await this.get_path(item.id)
        if (path) {
          // 物理的なパスを削除する処理
          rmSync(path, { recursive: true, force: true })
        }
      }
    }
    // pixiv_ex テーブルのデータを削除する。
    const delExSql = 'DELETE FROM pixiv_ex WHERE id IN (SELECT id FROM pixiv WHERE fav < 0)';
    this.db.prepare(delExSql).run();
    // pixiv テーブルのデータを削除する。
    const delsql = 'DELETE FROM pixiv WHERE fav < 0';
    this.db.prepare(delsql).run()
  }

  // 指定した id に対応する pixiv_ex テーブルのデータを削除する。
  async delete_ex(id) {
    const sql = 'DELETE FROM pixiv_ex WHERE id = ?';
    const stmt = this.db.prepare(sql)
    stmt.run([id]);
  }

  // fav に add を加算する。
  async fav_update(id, add = 1) {
    const sql = 'UPDATE pixiv SET fav = fav + ? WHERE id = ?';
    const stmt = this.db.prepare(sql)
    stmt.run([add, id])
  }

  // count に 1 を加算する。
  async count_update(id) {
    const sql = 'UPDATE pixiv SET count = count + 1 WHERE id = ?';
    const stmt = this.db.prepare(sql)
    stmt.run([id]);
  }

  // mark 一覧を取得する。
  // mark は重複を除く。
  // 返り値は mark の配列のPromise。
  async list_marks() {
    const sql = 'SELECT DISTINCT mark FROM pixiv ORDER BY mark';
    const rows = await this.db.prepare(sql).all();
    return rows
  }
  
  // 作者一覧を取得する。
  // レコード数と最大 fav を含む。
  async list_creators() {
    const sql = 'SELECT creator, count(*) AS cnt, max(fav) AS max_fav FROM pixiv GROUP BY creator ORDER BY creator';
    const rows = await this.db.prepare(sql).all();
    return rows
  }

  // private メソッド: files のトータルサイズを MB で得る。 
  async #get_total_size(files) {
    let totalSize = 0
    for (const f of files) {
      const stat = statSync(f)
      totalSize += stat.size
    }
    // totalSize を MB にする。
    totalSize = Math.round(totalSize / (1024 * 1024))
    return totalSize
  }

  // pixiv_ex を更新する。
  // id が存在しない時は追加、存在する時は更新
  async update_pixiv_ex(id) {
    // id に対応するパスのファイル数とトータルサイズを得る。
    const files = await this.get_image_files(id)
    const fileCount = files.length
    // フォルダ内のファイルサイズの合計 (MB) を得る。
    const totalSize = get_total_size(files)
    // id に対する pixiv_ex のレコードがあるか？
    const row = await this.get_id(id)
    // path に基づいて pixiv_ex.count, pixiv_ex.total_size を更新する。
    if (row) {
      await this.db.prepare('INSERT INTO pixiv_ex VALUES(?, ?, ?)').run([id, fileCount, totalSize])
    }
    else {
      await this.db.prepare('UPDATE pixiv_ex SET file_count=?, total_size=? WHERE id = ?').run([fileCount, totalSize, id])      
    }
  }

  // pixiv_ex テーブルをリフレッシュする。
  async refresh_pixiv_ex() {
    // pixiv_ex を初期化する。
    await this.db.prepare('DELETE FROM pixiv_ex').run()
    const rows = await this.db.prepare("SELECT id FROM pixiv ORDER BY id").all()
    for (const row of rows) {
      const id = row.id
      const files = await this.get_image_files(id)
      const file_count = files.length
      const total_size = get_total_size(files)
      await this.db.prepare('INSERT INTO pixiv_ex (id, file_count, total_size) VALUES (?, ?, ?)').run([id, file_count, total_size])
    }
  }

  // pixiv テーブルに登録されているパスが有効かをチェックする。
  // auto_delete: true の場合、削除する。
  // 戻り値は存在しないパスの数。
  async check_items(auto_delete=false) {
    const rows = await this.db.prepare("SELECT id, path FROM pixiv").all()
    let items = []
    for (const row of rows) {
      if (existsSync(row.path)) {
        // パスが存在する場合
      }
      else {
        items.push(row.path)
        // パスが存在しない場合
        if (auto_delete) {
          await this.delete(row.id)
        }
      }
    }
    return items
  }

  // 指定したパスが pixiv テーブルに 存在するかをチェックする。
  // auto_delete: true の場合、削除する。
  // 戻り値は存在する場合はその id、存在しない場合は null。
  async check_path(path, auto_delete=false) {
    const sql = "SELECT id FROM pixiv WHERE path = ?"
    const id = await this.db.prepare(sql).get(path)
    if (id === null) {
      // パスが存在しない場合
      if (auto_delete) {
        await this.delete(row.id)
      }
    }
    return id    
  }

  // id で指定したデータの path (folder) に含まれる画像ファイル一覧を返す。
  async get_image_files(id) {
    const sql = "SELECT path FROM pixiv WHERE id = ?";
    const row = await this.db.prepare(sql).get(id)
    if (row == null) {
      return [];
    }
    const dir = row.path
    console.log(dir)
    const files = await readdir(dir)
    if (process.platform == 'win32') {
      for (let f of files) {
        f = f.replaceAll('\\', '/')
      }
    }
    const imageFiles = []
    files.forEach(f => {
      if (f.match(/\.(jpg|png)$/i)) {
        imageFiles.push(join(dir, f))
      }
    })
    return imageFiles
  }

  // 接続を閉じる。
  async close() {
    this.db.close()
  }

  // getter count
  get item_count() {
    return this.db.prepare("SELECT count(*) FROM pixiv").get();
  }
  // getter vw_pictures
  get item_count_ex() {
    return this.db.prepare("SELECT count(*) FROM vw_pictures").get();
  }
}

// private メソッド: files のトータルサイズを MB で得る。 
function get_total_size(files) {
  let totalSize = 0
  for (const f of files) {
    const stat = statSync(f)
    totalSize += stat.size
  }
  // totalSize を MB にする。
  totalSize = Math.round(totalSize / (1024 * 1024))
  return totalSize
}
