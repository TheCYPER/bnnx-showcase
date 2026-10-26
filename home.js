// The home page: starts every live part. Each part is a module of its own; none of them signs or sends anything.

import { mountBoard } from "./board.js";
import { mountCounters } from "./counters.js";
import { mountHero } from "./hero.js";
import { mountDigitLab, mountPhotoLab } from "./labs.js";
import { mountNeuron } from "./neuron.js";
import { mountWall } from "./wall.js";

const $ = (id) => document.getElementById(id);

mountHero();
mountNeuron($("neuron"));
mountDigitLab($("digit-lab"));
mountPhotoLab($("photo-lab"));
mountBoard($("replay-board"), $("replay-label"));
mountWall($("wall"), $("wall-status"), $("wall-again"));
mountCounters();
