-- 昇嶺插單入口 第一版資料表
-- 原則：原文不可改；稽核、解析、確認、試算、決定、回覆、回填一律只能新增（append-only）。
-- 只有 orders.status、people 的綁定、bind_codes.used_at 這類「目前狀態」可以更新，而且每次更新都要另外寫稽核。
-- 分段符號：單獨一行「-- ;;」

-- 共用：擋下 UPDATE / DELETE 的觸發函式
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '資料表 % 只能新增，不能 %', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
-- ;;
CREATE OR REPLACE FUNCTION make_append_only(t text) RETURNS void AS $$
BEGIN
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_change()', t || '_no_change', t);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()', t || '_no_truncate', t);
END;
$$ LANGUAGE plpgsql;
-- ;;

-- 人員（只記角色與 LINE 綁定，不記任何個人績效）
CREATE TABLE people (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('boss','sales','planner','lead','admin')),
  line_user_id  text UNIQUE,
  bound_at      timestamptz,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- ;;

-- 一次性綁定碼
CREATE TABLE bind_codes (
  code        text PRIMARY KEY,
  person_id   text NOT NULL REFERENCES people(id),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  used_by     text,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- ;;

-- LINE webhook 事件：以事件 ID 去重；原始內容照存
CREATE TABLE line_events (
  event_id     text PRIMARY KEY,
  type         text NOT NULL,
  line_user_id text,
  body         jsonb NOT NULL,
  result       text,
  received_at  timestamptz NOT NULL DEFAULT now()
);
-- ;;

-- 原始訊息：整列不可改、不可刪
CREATE TABLE raw_messages (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source        text NOT NULL CHECK (source IN ('LINE','WEB','PHONE','ORAL')),
  text          text NOT NULL,
  sender_id     text REFERENCES people(id),
  line_event_id text REFERENCES line_events(event_id),
  received_at   timestamptz NOT NULL DEFAULT now()
);
-- ;;
SELECT make_append_only('raw_messages');
-- ;;

CREATE SEQUENCE order_seq;
-- ;;
CREATE TABLE orders (
  id              text PRIMARY KEY,
  raw_message_id  bigint NOT NULL UNIQUE REFERENCES raw_messages(id),
  status          text NOT NULL CHECK (status IN ('received','queued','decided','replied','done','returned')),
  created_by      text REFERENCES people(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- ;;

-- 解析紀錄（每次解析一列；engine = rule / llm+rule；fallback 記退回原因）
CREATE TABLE parses (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     text NOT NULL REFERENCES orders(id),
  engine       text NOT NULL CHECK (engine IN ('rule','llm+rule')),
  fallback     text,
  model        text,
  latency_ms   integer,
  fields       jsonb NOT NULL,
  llm_raw      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- ;;
SELECT make_append_only('parses');
-- ;;

-- 業務確認（確認後欄位 + 改了哪些）
CREATE TABLE confirmations (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    text NOT NULL REFERENCES orders(id),
  fields      jsonb NOT NULL,
  changes     jsonb NOT NULL DEFAULT '[]',
  by_person   text NOT NULL REFERENCES people(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- ;;
SELECT make_append_only('confirmations');
-- ;;

-- 參數版本（【我猜的】參數都在這裡；個案數字由程式預設，不在這裡改）
CREATE TABLE param_versions (
  ver         integer PRIMARY KEY,
  params      jsonb NOT NULL,
  note        text,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- ;;
SELECT make_append_only('param_versions');
-- ;;

-- 排程佇列版本（生管每天早上匯入 Excel/CSV 或手動維護；每次存成新版本）
CREATE TABLE queue_versions (
  ver         integer PRIMARY KEY,
  items       jsonb NOT NULL,
  source      text NOT NULL,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- ;;
SELECT make_append_only('queue_versions');
-- ;;

-- 試算（固定程式；輸入與結果整份存檔，可重現）
CREATE TABLE calcs (
  id           text PRIMARY KEY,
  order_id     text NOT NULL REFERENCES orders(id),
  rev          integer NOT NULL,
  param_ver    integer NOT NULL REFERENCES param_versions(ver),
  queue_ver    integer NOT NULL REFERENCES queue_versions(ver),
  as_of        jsonb NOT NULL,
  fingerprint  text NOT NULL,
  input        jsonb NOT NULL,
  result       jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, rev)
);
-- ;;
SELECT make_append_only('calcs');
-- ;;

-- 生管決定（採用 / 調整）；客戶期限不可早於試算完成日，改動要寫原因
CREATE TABLE decisions (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         text NOT NULL REFERENCES orders(id),
  calc_id          text NOT NULL REFERENCES calcs(id),
  type             text NOT NULL CHECK (type IN ('adopt','adjust')),
  cand_k           integer NOT NULL,
  completion_date  date NOT NULL,
  promise_date     date NOT NULL,
  reason           text,
  by_person        text NOT NULL REFERENCES people(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (promise_date >= completion_date),
  CHECK ((type = 'adopt' AND promise_date = completion_date) OR char_length(coalesce(reason,'')) >= 4)
);
-- ;;
SELECT make_append_only('decisions');
-- ;;

-- 回覆（業務複製的那一份文字；沒有試算或決定就不能有回覆）
CREATE TABLE replies (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     text NOT NULL REFERENCES orders(id),
  calc_id      text NOT NULL REFERENCES calcs(id),
  decision_id  bigint NOT NULL REFERENCES decisions(id),
  text         text NOT NULL,
  by_person    text NOT NULL REFERENCES people(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- ;;
SELECT make_append_only('replies');
-- ;;

-- 實際結果回填
CREATE TABLE actuals (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     text NOT NULL REFERENCES orders(id),
  ship_date    date,
  shipped_qty  integer,
  note         text,
  by_person    text NOT NULL REFERENCES people(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- ;;
SELECT make_append_only('actuals');
-- ;;

-- LINE 通知紀錄：mode = reply（免費）/ push（計則數）
CREATE TABLE notifications (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id    text REFERENCES people(id),
  line_user_id text,
  kind         text NOT NULL,
  mode         text NOT NULL CHECK (mode IN ('reply','push')),
  order_id     text REFERENCES orders(id),
  status       text NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error        text,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- ;;
SELECT make_append_only('notifications');
-- ;;

-- 稽核：只能新增
CREATE TABLE audit (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL,
  actor_role  text NOT NULL,
  action      text NOT NULL,
  target      text NOT NULL DEFAULT '',
  detail      text NOT NULL DEFAULT '',
  data        jsonb
);
-- ;;
SELECT make_append_only('audit');
-- ;;

-- 正式環境若有建立應用程式帳號 app_rw，再收回它對只增表的修改權（雙重保險；觸發器本身已會擋）
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    FOREACH t IN ARRAY ARRAY['raw_messages','parses','confirmations','param_versions','queue_versions','calcs','decisions','replies','actuals','notifications','audit'] LOOP
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM app_rw', t);
    END LOOP;
  END IF;
END $$;
