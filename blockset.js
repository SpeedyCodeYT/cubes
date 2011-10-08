// Copyright 2011 Kevin Reid, under the terms of the MIT License as detailed in
// the accompanying file README.md or <http://opensource.org/licenses/MIT>.

var BlockSet = (function () {
  var BlockSet = {};
  
  // This block ID is always empty air.
  BlockSet.ID_EMPTY = 0;
  
  // This block ID is used when an invalid block ID is met
  BlockSet.ID_BOGUS = 1;

  BlockSet.colors = Object.freeze({
    length: 256,
    textured: false,
    texture: null,
    writeColor: function (blockID, scale, target, offset) {
      target[offset] = (blockID & 3) / 3 * scale;
      target[offset+1] = ((blockID >> 2) & 3) / 3 * scale;
      target[offset+2] = ((blockID >> 4) & 3) / 3 * scale;
      target[offset+3] = blockID == BlockSet.ID_EMPTY ? 0 : scale;
    },
    isOpaque: function (blockID) { return blockID != BlockSet.ID_EMPTY },
    rebuildBlockTexture: function (blockID) {},
    worldFor: function (blockID) { return null; },
    serialize: function () { return { type: "colors" }; }
  });

  // Texture parameters
  var TILE_MAPPINGS = [
    // in this matrix layout, the input (column) vector is the tile coords
    // and the output (row) vector is the world space coords
    // so the lower row is the translation component.
    ["lz", mat4.create([
      // low z face
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ])],
    ["hz", mat4.create([
      // high z face
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1, 0,
      0, 0, 15, 1
    ])],
    ["lx", mat4.create([
      // low x face
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 0, 0, 0,
      0, 0, 0, 1
    ])],
    ["hx", mat4.create([
      // high x face
      0, 1, 0, 0,
      0, 0, 1, 0,
      -1, 0, 0, 0,
      15, 0, 0, 1
    ])],
    ["ly", mat4.create([
      // low y face
      0, 0, 1, 0,
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 0, 1
    ])],
    ["hy", mat4.create([
      // high y face
      0, 0, 1, 0,
      1, 0, 0, 0,
      0, -1, 0, 0,
      0, 15, 0, 1
    ])],
  ];

  BlockSet.newTextured = function (worlds) {
    if (worlds.length < 1) {
      throw new Error("Textured block set must have at least one world");
    }
    var tilings = [];
    var opacities = [false];

    for (var i = 0; i < worlds.length; i++) tilings.push({});
    
    // Texture holding tiles
    // TODO: Confirm that WebGL garbage collects these, or add a delete method to BlockSet for use as needed
    var blockTexture = gl.createTexture();
    
    var tileCountSqrt = 1;
    var tileUVSize;
    var blockTextureData;
    var tileAllocMap;
    var freePointer;
    var usageMap;
    var textureLost = false;
    function enlargeTexture() {
      tileCountSqrt *= 2;
      tileUVSize = 1/tileCountSqrt;

      // ImageData object used to buffer calculated texture data
      blockTextureData = document.createElement("canvas").getContext("2d")
        .createImageData(World.TILE_SIZE * tileCountSqrt, World.TILE_SIZE * tileCountSqrt);

      // tile position allocator
      tileAllocMap = new Uint8Array(tileCountSqrt*tileCountSqrt);
      freePointer = 0;
      
      // table mapping block slices to tile indexes, format 'worldindex,facename,layerindex'
      usageMap = {};
      
      // Flag indicating reallocation
      textureLost = true;
    }
    enlargeTexture();
    
    function tileAlloc() {
      var n = 0;
      while (tileAllocMap[freePointer]) {
        if ((++n) >= tileAllocMap.length) {
          if (typeof console !== 'undefined') 
            console.info("Enlarging block texture to hold", (tileAllocMap.length + 1));
          enlargeTexture();
        }
        freePointer = mod(freePointer + 1, tileAllocMap.length);
      }
      tileAllocMap[freePointer] = 1;
      return freePointer;
    }
    function tileFree(index) {
      tileAllocMap[index] = 0;
    }
    function tileCoords(index) {
      return [Math.floor(index / tileCountSqrt), mod(index, tileCountSqrt)];
    }
        
    var self = Object.freeze({
      length: worlds.length + 1,
      textured: true,
      texture: blockTexture,
      getTexTileSize: function () { return tileUVSize; },
      writeColor: function (blockID, scale, target, offset) {
        target[offset] = scale;
        target[offset+1] = scale;
        target[offset+2] = scale;
        target[offset+3] = scale;
      },
      tilings: tilings,
      rebuildBlockTexture: function (blockID) {
        var wi = blockID - 1;
        if (wi < 0 || wi >= worlds.length) return;
        
        var world = worlds[wi];
        var opaque = true;
        
        // To support non-cubical objects, we slice the entire volume of the block and generate as many tiles as needed. sliceWorld generates one such slice.
      
        function sliceWorld(faceName, layer, transform, layers) {
          var usageIndex = [wi,faceName,layer].toString();
          
          var index = usageMap[usageIndex] || (usageMap[usageIndex] = tileAlloc());
          var coord = tileCoords(index);
          var tileu = coord[0], tilev = coord[1];

          var thisLayerNotEmpty = false;
          var pixu = tileu*World.TILE_SIZE;
          var pixv = tilev*World.TILE_SIZE;
          // extract surface plane of block from world
          for (var u = 0; u < World.TILE_SIZE; u++)
          for (var v = 0; v < World.TILE_SIZE; v++) {
            var c = ((pixu+u) * blockTextureData.width + pixv+v) * 4;
            var vec = vec3.create([u,v,layer]);
            mat4.multiplyVec3(transform, vec, vec);
            var view = vec3.create([u,v,layer-1]);
            mat4.multiplyVec3(transform, view, view);
            
            var value = world.g(vec[0],vec[1],vec[2]);
            world.blockSet.writeColor(value, 255, blockTextureData.data, c);
            if (blockTextureData.data[c+3] < 255) {
              // A block is opaque if all of its outside (layer-0) pixels are opaque.
              if (layer == 0)
                opaque = false;
            } else if (!world.opaque(view[0],view[1],view[2])) {
              // A layer has significant content only if there is an UNOBSCURED (hence the above check) opaque pixel.
              thisLayerNotEmpty = true;
            }
          }
          
          // We can reuse this tile iff it was blank
          if (!thisLayerNotEmpty) {
            delete usageMap[usageIndex];
            tileFree(index);
          }

          // u,v coordinates of this tile for use by the vertex generator
          layers[layer] = thisLayerNotEmpty ? [tileu / tileCountSqrt, tilev / tileCountSqrt] : null;

          // TODO: trigger rerender of chunks only if we made changes to the tiling

          //console.log("id ", wi + 1, " face ", faceName, " layer ", layer, thisLayerNotEmpty ? " allocated" : " skipped");
        }
        TILE_MAPPINGS.forEach(function (m) {
          var faceName = m[0];
          var transform = m[1];
          var layers = [];
          tilings[wi][faceName] = layers;
          for (var layer = 0; layer < World.TILE_SIZE; layer++) {
            if (textureLost) return;
            sliceWorld(faceName, layer, transform, layers);
          }
          opacities[wi + 1] = opaque; // set by sliceWorld
        });
        
        // TODO: This results in wasted effort (esp. due to the control flow)
        if (textureLost) rebuildAll();

        // TODO: arrange to do this only once if updating several blocks
        gl.bindTexture(gl.TEXTURE_2D, blockTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, blockTextureData);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
      },
      isOpaque: function (blockID) { return opacities[blockID] || !(blockID in opacities); },
      worldFor: function (blockID) {
        return worlds[blockID - 1] || null;
      },
      serialize: function () {
        return {
          type: "textured",
          worlds: worlds.map(function (world) { return world.serialize(); })
        }
      }
    });
    
    function rebuildAll() {
      textureLost = false;
      for (var id = BlockSet.ID_EMPTY + 1; id < self.length; id++)
        self.rebuildBlockTexture(id);
    }
    
    rebuildAll();

    return self;    
  };

  BlockSet.unserialize = function (json) {
    if (json.type === "colors") {
      return BlockSet.colors;
    } else if (json.type === "textured") {
      return BlockSet.newTextured(json.worlds.map(function (world) { return World.unserialize(world); }));
    }
  };

  return Object.freeze(BlockSet);
})();
