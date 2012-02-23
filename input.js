// Copyright 2011 Kevin Reid, under the terms of the MIT License as detailed in
// the accompanying file README.md or <http://opensource.org/licenses/MIT>.

// TODO: explicitly connect global vars

function Input(config, eventReceiver, playerInput, menuElement, renderer, focusCell) {
  "use strict";

  var keymap = {};
  var mouselookMode = true;

  var mousePos = null;

  var quickSlots;
  var quickSlotLRU;

  // --- Utilities ---

  function evalVel(pos, neg) {
    return pos ? neg ? 0 : 1 : neg ? -1 : 0;
  }
  
  function setMouselook(value) {
    mouselookMode = value;
    menuElement.style.visibility = mouselookMode ? 'hidden' : 'visible';
    applyMousePosition();
  }
  
  function quick(n) {
    playerInput.tool = quickSlots[n];
  }
  
  // --- Focus ---
  
  eventReceiver.addEventListener("focus", function (event) {
    focusCell.set(true);
    return true;
  }, false);
  eventReceiver.addEventListener("blur", function (event) {
    focusCell.set(false);
    keymap = {};
    return true;
  }, false);

  // This is used as the conditiopn to inhibit focus-granting clicks from modifying the world. Simply checking focusCell is insufficient (due to focusiing happening before the event) in at least one case: when focus is on Chrome's Web Inspector.
  var delayedFocus = false;
  
  focusCell.whenChanged(function (value) {
    setTimeout(function () { 
      delayedFocus = value;
      
      if (!value) {
        // Blur is probably a good time to autosave
        Persister.flushAsync();
      }
    }, 0);
    return true;
  });
  
  // --- Keyboard events ---
  
  function interestingInMap(code) {
    switch (code) {
      case 'A'.charCodeAt(0): case 37:
      case 'W'.charCodeAt(0): case 38:
      case 'D'.charCodeAt(0): case 39:
      case 'S'.charCodeAt(0): case 40:
      case 'E'.charCodeAt(0):
      case 'C'.charCodeAt(0):
        return true;
      default:
        return false;
    }
  }
  function evalKeys() {
    var l = keymap['A'.charCodeAt(0)] || keymap[37];
    var r = keymap['D'.charCodeAt(0)] || keymap[39];
    var f = keymap['W'.charCodeAt(0)] || keymap[38];
    var b = keymap['S'.charCodeAt(0)] || keymap[40];
    var u = keymap['E'.charCodeAt(0)];
    var d = keymap['C'.charCodeAt(0)];
    
    playerInput.movement = [
      evalVel(r, l),
      evalVel(u, d),
      evalVel(b, f)
    ];
  }
  
  eventReceiver.addEventListener("keydown", function (event) {
    // avoid disturbing browser shortcuts
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    
    var code = event.keyCode || event.which;

    // handlers for 'action' keys (immediate effects)
    switch (String.fromCharCode(code)) {
      case "1": quick(0); return false;
      case "2": quick(1); return false;
      case "3": quick(2); return false;
      case "4": quick(3); return false;
      case "5": quick(4); return false;
      case "6": quick(5); return false;
      case "7": quick(6); return false;
      case "8": quick(7); return false;
      case "9": quick(8); return false;
      case "0": quick(9); return false;
      case "Q": 
        setMouselook(!mouselookMode);
        return false;
      case "R": playerInput.changeWorld(1);  return false;
      case "\x1B"/*Esc*/:
      case "F": playerInput.changeWorld(-1); return false;
      case " ": playerInput.jump(); return false;
    }

    // 'mode' keys such as movement directions go into the keymap
    if (interestingInMap(code)) {
      keymap[code] = true;
      evalKeys();
      return false;
    } else {
      return true;
    }
  }, false);
  document.addEventListener("keyup", function (event) {
    // on document to catch key-ups after focus changes etc.
    var code = event.keyCode || event.which;
    if (interestingInMap(code)) {
      var wasSetInMap = keymap[code];
      keymap[code] = false;
      evalKeys();
      return !wasSetInMap;
    } else {
      return true;
    }
  }, true);
  
  // --- Mouselook ---
  
  var dx = 0;
  var prevx = 0;
  
  function applyMousePosition() {
    if (!focusCell.get()) {
      playerInput.mousePos = null;
      dx = 0;
      return;
    } else {
      playerInput.mousePos = mousePos;
    }
    
    if (mousePos === null) { return; }

    var cs = window.getComputedStyle(eventReceiver, null);
    var w = parseInt(cs.width, 10);
    var h = parseInt(cs.height, 10);

    var swingY = mousePos[1] / (h*0.5) - 1;
    var swingX = mousePos[0] / (w*0.5) - 1;
    
    var directY = -Math.PI/2 * swingY;
    var directX = -Math.PI/2 * swingX;

    if (mouselookMode) {
      playerInput.pitch = directY;
      playerInput.yaw += (directX - prevx);
      dx = -(config.mouseTurnRate.get()) * deadzone(swingX, 0.1);
    } else {
      dx = 0;
    }
    prevx = directX;
  }
  focusCell.whenChanged(function (value) {
    applyMousePosition();
    return true;
  });
  
  function updateMouseFromEvent(event) {
    mousePos = [event.clientX, event.clientY];
    applyMousePosition();
  }
  
  eventReceiver.addEventListener("mousemove", function (event) {
    updateMouseFromEvent(event);
    return true;
  }, false);
  eventReceiver.addEventListener("mouseout", function (event) {
    mousePos = null;
    applyMousePosition();
    return true;
  }, false);

  // --- Clicks ---
  
  // Note: this has the side effect of inhibiting text selection on drag
  eventReceiver.addEventListener("mousedown", function (event) {
    updateMouseFromEvent(event);
    if (delayedFocus) {
      switch (event.button) {
        case 0: playerInput.deleteBlock(); break;
        case 2: playerInput.useTool(); break;
      }
    } else {
      eventReceiver.focus();
    }
    event.preventDefault(); // inhibits text selection
    return false;
  }, false);
  
  // TODO: Implement repeat on held down button
  
  eventReceiver.addEventListener("contextmenu", function (event) {
    event.preventDefault(); // inhibits context menu (on the game world only) since we use right-click for our own purposes
  }, false);

  // --- Stepping ---
  
  function step(timestep) {
    if (dx !== 0) {
      playerInput.yaw += dx*timestep;
    }
  }
  
  // --- Block menu ---
  
  var QUICK_SLOT_COUNT = 10;
  
  var menuItemsByBlockId;
  var hintTextsByBlockId;
  var blockSetInMenu;

  function deferrer(func) {
    var set = false;
    return function () {
      if (!set) {
        setTimeout(function () {
          set = false;
          func();
        }, 0);
        set = true;
      }
    }
  }

  function resetQuick() {
    quickSlots = [];
    quickSlotLRU = [];
    for (var i = 0; i < QUICK_SLOT_COUNT; i++) {
      quickSlots[i] = i + 1; // block ids starting from 1
      quickSlotLRU[i] = QUICK_SLOT_COUNT - (i + 1); // reverse order
    }
  }
  resetQuick();

  function forAllMenuBlocks(f) {
    for (var i = 1; i < blockSetInMenu.length; i++) f(i, menuItemsByBlockId[i]);
  }
  
  var updateDeferred = deferrer(updateMenuBlocks);
  var menuListener = {
    // deferred because otherwise we act while in the middle of a rebuild
    texturingChanged: function (id) { updateDeferred(); return true; },
    tableChanged:     function (id) { updateDeferred(); return true; }
  };
  
  function updateMenuBlocks() {
    if (playerInput.blockSet !== blockSetInMenu) {
      if (blockSetInMenu) blockSetInMenu.listen.cancel(menuListener);
      blockSetInMenu = playerInput.blockSet;
      if (blockSetInMenu) blockSetInMenu.listen(menuListener);
    }
    
    menuItemsByBlockId = [];
    hintTextsByBlockId = [];
    resetQuick();

    var blockRenderer = new BlockRenderer(blockSetInMenu, renderer);
  
    var sidecount = Math.ceil(Math.sqrt(blockSetInMenu.length));
    var size = Math.min(64, 300 / sidecount);
  
    forAllMenuBlocks(function (i) {
      // element structure and style
      var item = menuItemsByBlockId[i] = document.createElement("span");
      item.className = "menu-item";
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64; // TODO magic number
      canvas.style.width = canvas.style.height = size + "px";

      // keyboard shortcut hint
      var hint = document.createElement("kbd");
      hint.appendChild(hintTextsByBlockId[i] = document.createTextNode(""));
      hint.className = "menu-shortcut-key";
      item.appendChild(hint);

      item.appendChild(canvas);
      
      // render block
      var cctx = canvas.getContext('2d');
      cctx.putImageData(blockRenderer.blockToImageData(i, cctx), 0, 0);

      // event handlers
      (function (item,canvas,i) { // TODO remove, now moot
        canvas.onclick = function () {
          playerInput.tool = i;
          
          var quickSlot = quickSlots.indexOf(i);
          if (quickSlot === -1) {
            // promote to recently-used menu
            quickSlot = quickSlotLRU.shift();
            quickSlots[quickSlot] = i;
            updateMenuLayout();
          } else {
            // touch LRU entry
            quickSlotLRU.splice(quickSlotLRU.indexOf(quickSlot), 1);
          }
          quickSlotLRU.push(quickSlot);
          
          return false;
        };
        canvas.onmousedown = canvas.onselectstart = function () {
          item.className = "menu-item selectedTool";
          return false; // inhibit selection
        };
        canvas.oncontextmenu = function () {
          playerInput.enterWorld(i);
          return false;
        };
        canvas.onmouseout = function () {
          item.className = "menu-item " + (i === playerInput.tool ? " selectedTool" : "");
          return true;
        };
      })(item,canvas,i);
    });
    
    blockRenderer.deleteResources();
    
    // since we rebuilt the menu these need redoing
    updateMenuLayout();
    updateMenuSelection();
  }
  
  function updateMenuLayout() {
    // This is not especially efficient, but it doesn't need to be.
    
    while (menuElement.firstChild) menuElement.removeChild(menuElement.firstChild);

    var quickGroup = document.createElement("div");

    forAllMenuBlocks(function (i, item) {
      menuElement.appendChild(item);
      hintTextsByBlockId[i].data = "";
    });
    quickSlots.forEach(function (blockId, index) {
      var item = menuItemsByBlockId[blockId];
      if (item) {
        quickGroup.appendChild(item);
        hintTextsByBlockId[blockId].data = ((index+1) % 10).toString();
      }
    });
    
    var addButton = document.createElement("button");
    addButton.className = "menu-item menu-button";
    addButton.appendChild(document.createTextNode("+"));
    addButton.onclick = function () {
      playerInput.blockSet.add(WorldGen.newRandomBlockType(playerInput.blockSet.tileSize, playerInput.blockSet.get(1).world.blockSet));
      eventReceiver.focus();
    };
    menuElement.appendChild(addButton);

    menuElement.appendChild(quickGroup);
  }
  
  function updateMenuSelection() {
    var tool = playerInput.tool;
    forAllMenuBlocks(function (i, item) {
      item.className = i === tool ? "menu-item selectedTool" : "menu-item";
    });
  }

  playerInput.listen({
    changedWorld: function (v) {
      // TODO: remember quick slot contents across worlds (add an input-state object to player's Places?)
      updateMenuBlocks();
      return true;
    },
    changedTool: function (v) {
      updateMenuSelection();
      return true;
    }
  });

  updateMenuBlocks();
    
  // --- Methods ---
  
  this.step = step;
  
  // --- Late initialization ---
  
  setMouselook(mouselookMode);
}
