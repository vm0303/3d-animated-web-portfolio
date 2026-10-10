#!/usr/bin/env node
"use strict";

/*
 * Production Contact family pass.
 *
 * Geometry/motion, success/error visuals, and all cooldown visual states now
 * run inside ONE browser/context lifecycle per viewport through the unified
 * runner. This avoids three separate 428-case passes, three Vite lifecycles,
 * and three output trees.
 */

require("./run-contact-unified-qa.cjs");
