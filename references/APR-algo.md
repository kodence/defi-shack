

###Core math foundation
The fee accumulator model (feeGrowthGlobal, feeGrowthInside, Q128.128 fixed-point) is fully specified in the Uniswap V3 whitepaper:
https://app.uniswap.org/whitepaper-v3.pdf
Relevant sections: §6.2 (fees), §6.3 (fee growth inside a tick range), §6.29–6.30 (token amount formulas).

###Official fee concepts
https://docs.uniswap.org/concepts/protocol/fees
Covers fee tiers (0.01%, 0.05%, 0.30%, 1%), how in-range liquidity earns fees, and how fees are collected separately rather than auto-compounded.

###V3 math primer (Uniswap blog)
https://blog.uniswap.org/uniswap-v3-math-primer
The most accessible official explanation of ticks, sqrtPriceX96, and liquidity concentration — directly underpins the capital efficiency and APR formulas we used.

###Community APR methodology article
The conventional APR = (Expected Fees − Expected IL) / TVL approach falls short for V3; a more accurate method accounts for liquidity concentration via a Liquidity Concentration Factor Medium:
https://medium.com/@alexeuler/navigating-uniswap-v3-a-comprehensive-guide-to-apr-estimation-and-pool-risk-analysis-22cdab21e2db

## Simulator Layout

### Top bar
