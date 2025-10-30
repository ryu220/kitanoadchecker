#!/bin/bash

# Add new files to priority-mapping.csv

CSV_FILE="config/knowledge-priority-mapping.csv"

echo "=== Updating priority-mapping.csv ==="
echo ""

# 薬機法_行政資料 (P2 Laws)
echo "📝 Adding 薬機法 行政資料 (P2 Laws)..."
cat >> "$CSV_FILE" << 'PHARMA_LAWS'
厚生労働層_医療機器の添付文書の記載要領に関するＱ＆Ａについて_20141031.txt,2,薬機法,law,common
厚生労働省_一般用医薬品から医薬部外品に移行する品目の範囲について（薬食発第0716002号）_20040716.txt,2,薬機法,law,common
厚生労働省_一般用医薬品のインターネット販売について_20140501.txt,2,薬機法,law,common
厚生労働省_化粧品における特定成分の特記表示について（医薬監麻発0310第３号）_20250310.txt,2,薬機法,law,common
厚生労働省_新指定医薬部外品の製造（輸入）承認基準等について（医薬発第２８３号）_19990312.txt,2,薬機法,law,common
厚生労働省_昭和36年２月８日薬発第44号薬務局長通知_19610208.txt,2,薬機法,law,common
厚生労働省_昭和37年９月６日薬発第464号薬務局長通知_19620906.txt,2,薬機法,law,common
厚生労働省_無承認無許可医薬品の指導取締りについて（昭和46年６月１日 薬発第476号）.txt,2,薬機法,law,common
厚生労働省‗医療機器の添付文書の記載要領（細則）について（薬食安発1002第１号）‗20221021.txt,2,薬機法,law,common
薬事法ドットコム（仮）_OTC 医薬品等の広告自主申し合わせ.txt,3,薬機法,industry_guideline,common
PHARMA_LAWS

# 景表法_行政資料 (P3 Government Guidelines)
echo "📝 Adding 景表法 行政資料 (P3 Guidelines)..."
cat >> "$CSV_FILE" << 'MISREP_GUIDES'
公正取引委員会_No.1表示に関する実態調査報告書_20080613.txt,3,景表法,government_guideline,common
内閣府_事業者が講ずべき景品類の提供及び表示の管理上の措置についての指針（内閣府告示第74号）_20220629.txt,3,景表法,government_guideline,common
消費者庁_No.1 表示に関する実態調査報告書_20240926.txt,3,景表法,government_guideline,common
消費者庁_いわゆる『ダークパターン』に関する取引の実態調査（リサーチ・ディスカッション・ペーパー）_20250407.txt,3,景表法,government_guideline,common
消費者庁_アフィリエイト広告等に関する検討会 報告書_20220215.txt,3,景表法,government_guideline,common
消費者庁_インターネット消費者取引に係る広告表示に関する景品表示法上の問題点及び留意事項_20220629.txt,3,景表法,government_guideline,common
消費者庁_スマートフォンにおける打消し表示に関する実態調査報告書_00000000.txt,3,景表法,government_guideline,common
消費者庁_事業者が講ずべき景品類の提供及び表示の管理上の措置についての指針_20220629.txt,3,景表法,government_guideline,common
消費者庁_令和６年度における景品表示法等の運用状況及び表示等の適正化への取組_20250529.txt,3,景表法,government_guideline,common
消費者庁_健康食品に関する景品表示法及び健康増進法上の留意事項について_20160630.txt,3,景表法,government_guideline,common
消費者庁_広告表示に接する消費者の視線に関する実態調査報告書 _00000000.txt,3,景表法,government_guideline,common
消費者庁_打消し表示に関する実態調査報告書_00000000.txt,3,景表法,government_guideline,common
消費者庁_景品に関するＱ＆Ａ.txt,3,景表法,government_guideline,common
MISREP_GUIDES

# 特商法_行政資料 (P2 Laws)
echo "📝 Adding 特商法 行政資料 (P2 Laws)..."
cat >> "$CSV_FILE" << 'SPECIFIED_LAWS'
消費者庁_特定商取引に関する法律・解説_20230601.txt,2,特商法,law,common
消費者庁_通信販売における返品特約の表示についてのガイドライン_20241119.txt,2,特商法,law,common
消費者庁_通信販売の申込み段階における表示についてのガイドライン_20241119.txt,2,特商法,law,common
消費者庁_電子メール広告をすることの承諾・請求の取得等に係る「容易に認識できるように表示していないこと」に係るガイドライン_20241119.txt,2,特商法,law,common
消費者庁_インターネット通販における「意に反して契約の申込みをさせようとする行為」に係るガイドライン_20171201.txt,2,特商法,law,common
消費者庁_特定商取引に関する法律第３条の２等の運用指針- 再勧誘禁止規定に関する指針 -_20241119.txt,2,特商法,law,common
消費者庁_特定商取引に関する法律第６条の２等の運用指針- 不実勧誘・誇大広告等の規制に関する指針 -_20241119.txt,2,特商法,law,common
経済産業省_改正特定商取引法における 「電子メール広告規制（オプトイン規制）」 のポイント_20081201.txt,2,特商法,law,common
経済産業省_特定商取引に関する法律施行規則の一部を改正する省令_20081201.txt,2,特商法,law,common
SPECIFIED_LAWS

# 健増法 (P2 Laws)
echo "📝 Adding 健増法 (P2 Laws)..."
cat >> "$CSV_FILE" << 'HEALTH_LAWS'
一般社団法人健康食品産業協議会ほか_ 「機能性表示食品」適正広告自主基準第2版_230605.txt,3,薬機法,industry_guideline,common
厚生労働省_無承認無許可医薬品の指導取締りについて（昭和46年６月１日 薬発第476号）_19710601.txt,2,薬機法,law,common
消費者庁_食品表示法の概要_20130600.txt,2,薬機法,law,common
厚生労働省_無承認無許可医薬品の監視指導について（昭和62年９月22日 薬監第88号）_20150401.txt,2,薬機法,law,common
消費者庁_食品表示法要綱_20130600.txt,2,薬機法,law,common
HEALTH_LAWS

# 薬機法_民間資料 (P3 Industry Guidelines)
echo "📝 Adding 薬機法 民間資料 (P3 Industry Guidelines)..."
cat >> "$CSV_FILE" << 'PHARMA_INDUSTRY'
日本コンタクトレンズ協会 _コンタクトレンズの広告自主基準_20210513.txt,3,薬機法,industry_guideline,common
一般社団法人日本医療機器産業連合会企業倫理委員会_医療機器適正広告ガイド集_20161201.txt,3,薬機法,industry_guideline,common
PHARMA_INDUSTRY

echo ""
echo "✅ Priority mapping updated!"
echo ""

# Count total lines
total_lines=$(wc -l < "$CSV_FILE")
echo "Total mappings: $((total_lines - 1))"
