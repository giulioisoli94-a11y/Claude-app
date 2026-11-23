#!/usr/bin/env bash
# Downloads real daily OHLCV data from public GitHub datasets into backtest/data/.
# Set A: QSTK Yahoo dataset, 2000-2012. Set B: 2016-2020.
set -u
cd "$(dirname "$0")"
mkdir -p data/a data/b
TICKERS="AAPL MSFT INTC CSCO ORCL IBM HPQ TXN QCOM ADBE AMZN EBAY XOM CVX COP SLB OXY HAL JPM BAC C WFC GS MS AXP USB JNJ PFE MRK ABT LLY BMY AMGN UNH MDT KO PEP PG WMT HD LOW MCD NKE COST TGT DIS CMCSA VZ T GE HON MMM CAT DE BA LMT UNP UPS FDX DD DOW NEM FCX AA X MO CL KMB GIS K HSY SBUX YUM F GM NVDA AMD MU AMAT KLAC LRCX ADP PAYX EMR ITW ETN PH SPG PLD AEP DUK SO EXC D NEE"
fetch() { # set url-prefix ticker
  local out="data/$1/$3.csv"
  [ -s "$out" ] && return 0
  local code
  code=$(curl -s -m 60 -o "$out" -w "%{http_code}" "$2/$3.csv")
  [ "$code" = "200" ] || rm -f "$out"
}
export -f fetch
A=https://raw.githubusercontent.com/QuantSoftware/QuantSoftwareToolkit/master/QSTK/QSData/Yahoo
B=https://raw.githubusercontent.com/jcwill415/Stock_Market_Data_Analysis/master/stock_dfs2
for t in $TICKERS; do echo "a $A $t"; echo "b $B $t"; done | xargs -P 12 -n 3 bash -c 'fetch "$0" "$1" "$2"'
echo "set A: $(ls data/a | wc -l) files, set B: $(ls data/b | wc -l) files"
