// Deployment facts shown by the demo. tests/test_demo.py checks them against deployments/bsc-testnet.json,
// the IR in models/ and the verification reports, so this file cannot drift from what is on chain.

export const NETWORK = Object.freeze({
  name: "BSC testnet",
  chainId: 97,
  explorer: "https://testnet.bscscan.com",
  // Two independent operators; every classification is sent to both.
  nodes: Object.freeze([
    Object.freeze({ label: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" }),
    Object.freeze({ label: "drpc", url: "https://bsc-testnet.drpc.org" }),
  ]),
});

// The largest single transaction BSC accepts; bigger computations only run as read-only calls.
export const TX_GAS_CAP = 16_777_216;

export const MODELS = Object.freeze({
  "d1-mnist": Object.freeze({
    title: "Handwritten digits",
    dataset: "MNIST",
    address: "0x9B1FE44987bC449d28aC8c77e6027A6596c91901",
    irHash: "0x4fd07609d945e4db6f31019815b8e048aaedb5bb4599baf7a8802477b831ec6d",
    input: Object.freeze({ height: 28, width: 28, channels: 1 }),
    classes: Object.freeze(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]),
    architecture: "binarize → 784–512–512–10",
    testAccuracy: 0.9786,
    gas: Object.freeze({ min: 1_045_749, max: 1_046_445, samples: 5 }),
  }),
  "d2-cifar10": Object.freeze({
    title: "Small colour photos",
    dataset: "CIFAR-10",
    address: "0x3b44070814A2DBcCAdf8194899cb6afe759EB2b8",
    irHash: "0xbbab3205f2153de6427cf316709d0a296e27753518d5418977905577890a80f0",
    input: Object.freeze({ height: 32, width: 32, channels: 3 }),
    classes: Object.freeze(["airplane", "automobile", "bird", "cat", "deer", "dog", "frog", "horse", "ship", "truck"]),
    architecture: "6 binary convolutions + 3 dense layers",
    testAccuracy: 0.8142,
    gas: Object.freeze({ min: 43_927_205, max: 43_927_298, samples: 5 }),
  }),
});

// The gomoku page (gomoku.html). The model is models/gomoku-mb on BnnxGraph2; tests/test_demo.py checks these facts
// against deployments/bsc-testnet.json, the IR and the verification report. `game` stays null until GomokuGame is
// deployed and a whole game is played on BSC testnet (task 09-30-bnnx-gomoku-demo, step N4).
export const GOMOKU = Object.freeze({
  model: Object.freeze({
    name: "gomoku-mb",
    address: "0x60154ef9ce63a94347465e495c511ccefae2ed95",
    irHash: "0x72f4cdd16ceb6e4aa4362cb44d546c25c28fb6cec9abad6cd22f1ece461b6c47",
    architecture: "line lookup → int8 3×3 convolution → two 1×1 convolutions, 4-bit activations; one score per point",
    gas: Object.freeze({ min: 5_300_661, max: 5_303_436, samples: 20 }),
  }),
  // Two independent operators for every AI move. drpc, the image page's second node, did not answer from the network
  // this page was checked on (2026-10-22: its requests timed out; publicnode, BNB Chain's node and thirdweb answered).
  nodes: Object.freeze([
    Object.freeze({ label: "publicnode", url: "https://bsc-testnet-rpc.publicnode.com" }),
    Object.freeze({ label: "bnbchain", url: "https://bsc-testnet-dataseed.bnbchain.org" }),
  ]),
  // blocks behind the lowest node head that every receipt is read at (BSC testnet has sub-second blocks)
  lag: 10,
  game: Object.freeze({
    // reports/gomoku/testnet-game.json: deployed and played 2026-10-22, every AI stone re-checked on two nodes
    address: "0xC6c5C989F95118EbAb6a1e47F629147E1738347B",
    id: 0,
    aiIsBlack: true,
    status: 2,
    moves: Object.freeze([80, 96, 81, 82, 110, 95, 94, 66, 78, 126, 79, 77, 62, 46, 64, 49, 50, 92, 63, 61, 109, 124, 108, 111, 93, 123, 48]),
    transactions: Object.freeze([
    Object.freeze({ hash: "0x462c81ed26d8e3c9c4c42d8ddc58f881ac1ac9251097860660c981009999b539", block: 138250903, gasUsed: 5560869, plies: Object.freeze([0]) }),
    Object.freeze({ hash: "0x2ee9379348858cdbf38b39e2d70c88e640cc4b3e177b61fd42be77c75063b042", block: 138250911, gasUsed: 5477006, plies: Object.freeze([1, 2]) }),
    Object.freeze({ hash: "0xae7a467cee5c8941b3fefc4b81b9b56fb6421f800a80b428ca06bf8545f126fa", block: 138250920, gasUsed: 5459983, plies: Object.freeze([3, 4]) }),
    Object.freeze({ hash: "0x9bb9b1c8cb79c431a4b4669c7395e413e7b582db1f050bfb82485b7588fbac85", block: 138250928, gasUsed: 5462141, plies: Object.freeze([5, 6]) }),
    Object.freeze({ hash: "0xfe1de6f757b59f93ab6c75e60575e76d26214668b04ed08a75cf7e5d8bb603fb", block: 138250944, gasUsed: 5461429, plies: Object.freeze([7, 8]) }),
    Object.freeze({ hash: "0x7dfb0c9d29a109e1e5fcc6c6b215312f1a7207f7c1dc85ed8b66272eab0cb7b1", block: 138250949, gasUsed: 5462746, plies: Object.freeze([9, 10]) }),
    Object.freeze({ hash: "0x6318710b244a4a9ed31b39e13fd7e1a7beaf75c6b1717464454ebe134473238f", block: 138250956, gasUsed: 5461716, plies: Object.freeze([11, 12]) }),
    Object.freeze({ hash: "0xa82d1db3bda5eebb7930bb86c082a46a7e1ca46d18a8d966483c80480bb88ecc", block: 138250965, gasUsed: 5462182, plies: Object.freeze([13, 14]) }),
    Object.freeze({ hash: "0xab1307cbbe5092b3eed45da2ffb79cbad6e3da18768277ec90790b4f9ffa881b", block: 138250973, gasUsed: 5460537, plies: Object.freeze([15, 16]) }),
    Object.freeze({ hash: "0x6c47b44bf536adc0e9371dc685f78de4cd57a30817dc54adaaa9a694617da69d", block: 138250982, gasUsed: 5463146, plies: Object.freeze([17, 18]) }),
    Object.freeze({ hash: "0x157633cd28a7c32628a423ba2feb616607698b5d65eb5ff6a103ac7a7d5d36b5", block: 138250991, gasUsed: 5464104, plies: Object.freeze([19, 20]) }),
    Object.freeze({ hash: "0x5e3046793b297cb6d0f6989232c4a979cfdf740ba368162a2551487c092b2740", block: 138250998, gasUsed: 5462131, plies: Object.freeze([21, 22]) }),
    Object.freeze({ hash: "0x27f8667006cb9ac432df4eaa3eb68be4e9de628b4fe24a5fdfbb9044aa8ae1bb", block: 138251016, gasUsed: 5466626, plies: Object.freeze([23, 24]) }),
    Object.freeze({ hash: "0x91aa1565d47a4f2ed897c5ca60c34425ed94ef5fb8626efceb9a3d54ef05adfb", block: 138251021, gasUsed: 5462519, plies: Object.freeze([25, 26]) }),
    ]),
  }),
});
