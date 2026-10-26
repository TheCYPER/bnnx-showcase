# BNNX showcase

A static page about **BNNX**: small trained neural networks compiled into pure contracts on BNB Chain, whose answers can be checked against a reference program integer for integer.

Live page: https://thecyper.github.io/bnnx-showcase/

- Everything on the page runs against contracts on **BSC testnet**. Nothing is deployed on mainnet. The page never asks for a wallet and signs nothing.
- The demos make free read-only calls (`eth_call`) to two independent public nodes and show what they answered. When a node does not answer, the page says so.
- This repository holds only the built page (HTML, CSS, JavaScript). The BNNX toolchain (Python library, command line, contracts, model files) lives in a private repository, so no licence is granted for the code here yet.
- It uses system fonts and loads nothing from outside except those node calls.
