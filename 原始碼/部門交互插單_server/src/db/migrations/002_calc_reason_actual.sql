-- 試算原因（首次試算／佇列變動／參數變動）；回填加上實際換線次數與小時（用來算試算誤差）
ALTER TABLE calcs ADD COLUMN reason text NOT NULL DEFAULT '';
-- ;;
ALTER TABLE actuals ADD COLUMN changeovers integer;
-- ;;
ALTER TABLE actuals ADD COLUMN changeover_hours numeric;
