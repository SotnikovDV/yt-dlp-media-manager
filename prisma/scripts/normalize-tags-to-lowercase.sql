-- Нормализация тегов к нижнему регистру (SQLite).
-- Объединяет дубликаты вида "Cursor" и "cursor" в один тег "cursor".
-- Запуск: sqlite3 prisma/db/custom.db < prisma/scripts/normalize-tags-to-lowercase.sql
-- или из корня: sqlite3 path/to/your.db < prisma/scripts/normalize-tags-to-lowercase.sql

BEGIN TRANSACTION;

-- 1. Теги, которые можно просто переименовать (нет другого тега с таким же name в нижнем регистре)
UPDATE Tag
SET name = LOWER(name)
WHERE name != LOWER(name)
  AND NOT EXISTS (
    SELECT 1 FROM Tag t2
    WHERE t2.name = LOWER(Tag.name) AND t2.id != Tag.id
  );

-- 2. Пары (старый id, новый id) для слияния: тег с "Cursor" -> тег с "cursor"
CREATE TEMP TABLE IF NOT EXISTS tag_merge_pairs AS
SELECT t1.id AS old_id, t2.id AS new_id
FROM Tag t1
JOIN Tag t2 ON t2.name = LOWER(t1.name) AND t2.id != t1.id
WHERE t1.name != LOWER(t1.name);

-- 3. Удалить связи VideoTag, которые создадут дубликат (видео уже привязано к целевому тегу)
DELETE FROM VideoTag
WHERE (videoId, tagId) IN (
  SELECT VT.videoId, VT.tagId
  FROM VideoTag VT
  JOIN tag_merge_pairs mp ON VT.tagId = mp.old_id
  WHERE EXISTS (
    SELECT 1 FROM VideoTag V2
    WHERE V2.videoId = VT.videoId AND V2.tagId = mp.new_id
  )
);

-- 4. Переназначить оставшиеся связи со старого тега на новый
UPDATE VideoTag
SET tagId = (SELECT mp.new_id FROM tag_merge_pairs mp WHERE mp.old_id = VideoTag.tagId LIMIT 1)
WHERE tagId IN (SELECT old_id FROM tag_merge_pairs);

-- 5. Удалить старые теги (дубликаты)
DELETE FROM Tag
WHERE id IN (SELECT old_id FROM tag_merge_pairs);

DROP TABLE IF EXISTS tag_merge_pairs;

COMMIT;
