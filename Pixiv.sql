/* 
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Other/SQLTemplate.sql to edit this template
 */
/**
 * Author:  user
 * Created: 2025/08/22
 */
CREATE TABLE pixiv (
   id integer primary key autoincrement,
   title text not null,
   creator text not null,
   path text not null unique,
   media text,
   mark text,
   fav int default 0,
   count default 0,
   info text,
   date date
);

CREATE TABLE pixiv_ex (
  id integer not null unique,
  file_count integer,
  total_size number
);

CREATE VIEW vw_pictures AS
  SELECT
    a.id,
    a.title,
    a.creator,
    a.path,
    a.media,
    a.mark,
    a.fav,
    a.count,
    a.info,
    a.date,
    b.file_count,
    b.total_size 
FROM pixiv a 
INNER JOIN pixiv_ex b
WHERE a.id = b.id;
