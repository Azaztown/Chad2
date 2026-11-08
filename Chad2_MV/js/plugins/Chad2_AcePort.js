//=============================================================================
// Chad2_AcePort.js
//=============================================================================
/*:
 * @plugindesc v1.0 Ports Chad II's small VX Ace scripts to MV: terrain-tag
 * passability, slippery tiles and state graphics.
 * @author Chad II team (port of scripts by Yanfly & Neon Black)
 *
 * @param Ignore Passage Terrain Tag
 * @desc Tiles with this terrain tag do not affect passability (Ace
 * "Passability" script). 0 disables this.
 * @default 2
 *
 * @param Slide Frame
 * @desc Character pattern shown while sliding on slippery tiles.
 * Standing frame is 1.
 * @default 2
 *
 * @help
 * ============================================================================
 * What this replaces
 * ============================================================================
 * 1. "Passability (keep this at top)"
 *    Tiles whose terrain tag equals "Ignore Passage Terrain Tag" are skipped
 *    when checking passage, like star [*] tiles.
 *
 * 2. Yanfly Engine Ace - Slippery Tiles
 *    Tileset notetags (unchanged from Ace):
 *      <slippery: x>
 *      <slippery: x, y, ...>
 *    Tiles with terrain tag x make the player keep sliding forward until
 *    blocked or until they reach a non-slippery tile. Dashing is disabled
 *    on slippery tiles.
 *
 * 3. Neon Black - State Graphics v1.3
 *    State notetags (unchanged from Ace):
 *      battler gfx["name" hue]
 *      actor battler gfx["name" hue id, id, ...]
 *      enemy battler gfx["name" hue id, id, ...]
 *      character gfx["name" index]     (also actor/enemy variants)
 *      face gfx["name" index]          (also actor/enemy variants)
 *      name change["name"]             (also actor/enemy variants)
 *    The highest-priority state wins. Actor/enemy specific tags take
 *    priority over the plain tag of the same state.
 *    An empty name, e.g. battler gfx["" 50], keeps the normal graphic and
 *    only changes the hue. (In Ace this tag was silently ignored.)
 *    Note: MV cannot hue-shift side-view actor sheets, so hue only affects
 *    enemies.
 */
//=============================================================================

var Imported = Imported || {};
Imported.Chad2_AcePort = true;

(function() {
'use strict';

var params = PluginManager.parameters('Chad2_AcePort');
var IGNORE_TAG = Number(params['Ignore Passage Terrain Tag'] || 0);
var SLIDE_FRAME = Number(params['Slide Frame'] || 2);

//=============================================================================
// 1. Passability
//=============================================================================

if (IGNORE_TAG > 0) {
    Game_Map.prototype.checkPassage = function(x, y, bit) {
        var flags = this.tilesetFlags();
        var tiles = this.allTiles(x, y);
        for (var i = 0; i < tiles.length; i++) {
            var flag = flags[tiles[i]];
            if ((flag & 0x10) !== 0) continue;          // [*] no effect
            if ((flag >> 12) === IGNORE_TAG) continue;  // ignored terrain tag
            if ((flag & bit) === 0) return true;        // [o] passable
            if ((flag & bit) === bit) return false;     // [x] impassable
        }
        return false;
    };
}

//=============================================================================
// 2. Slippery Tiles
//=============================================================================

var slipperyCache = {};

function slipperyTags(tileset) {
    if (!tileset) return [];
    if (!slipperyCache[tileset.id]) {
        var tags = [];
        var re = /<slippery:\s*(\d+(?:\s*,\s*\d+)*)\s*>/ig;
        var m;
        while ((m = re.exec(tileset.note || ''))) {
            m[1].split(',').forEach(function(n) {
                var tag = Number(n);
                if (tags.indexOf(tag) < 0) tags.push(tag);
            });
        }
        slipperyCache[tileset.id] = tags;
    }
    return slipperyCache[tileset.id];
}

Game_Map.prototype.isSlipperyFloor = function(x, y) {
    if (!this.isValid(x, y)) return false;
    var tags = slipperyTags(this.tileset());
    return tags.length > 0 && tags.indexOf(this.terrainTag(x, y)) >= 0;
};

Game_CharacterBase.prototype.isOnSlipperyFloor = function() {
    return $gameMap.isSlipperyFloor(this._x, this._y);
};

Game_CharacterBase.prototype.isSlipperyPose = function() {
    return this.isOnSlipperyFloor() && !this.hasStepAnime();
};

var _Game_Player_isDashing = Game_Player.prototype.isDashing;
Game_Player.prototype.isDashing = function() {
    if (this.isOnSlipperyFloor()) return false;
    return _Game_Player_isDashing.call(this);
};

var _Game_Player_update = Game_Player.prototype.update;
Game_Player.prototype.update = function(sceneActive) {
    _Game_Player_update.call(this, sceneActive);
    this.updateSlippery();
};

Game_Player.prototype.updateSlippery = function() {
    if ($gameMap.isEventRunning()) return;
    if (!this.isOnSlipperyFloor()) return;
    if (this.isMoving()) return;
    if (this.isInVehicle()) return;
    this.moveStraight(this.direction());
};

var _Game_Player_pattern = Game_Player.prototype.pattern;
Game_Player.prototype.pattern = function() {
    if (this.isSlipperyPose()) return SLIDE_FRAME;
    return _Game_Player_pattern.call(this);
};

var _Game_Follower_pattern = Game_Follower.prototype.pattern;
Game_Follower.prototype.pattern = function() {
    if (this.isSlipperyPose()) return SLIDE_FRAME;
    return _Game_Follower_pattern.call(this);
};

//=============================================================================
// 3. State Graphics
//=============================================================================

var RE_ACTOR  = /actor (battler|character|face) gfx\["(.*)" (\d+) ([\d, ]+)\]/i;
var RE_ENEMY  = /enemy (battler|character|face) gfx\["(.*)" (\d+) ([\d, ]+)\]/i;
var RE_COMMON = /(battler|character|face) gfx\["(.*)" (\d+)\]/i;
var RE_NAME   = /(actor |enemy )?name change\["(.+)"([\d, ]*)\]/i;
var KIND = {
    battler:   ['battler', 'battlerHue'],
    character: ['chara',   'charaIndex'],
    face:      ['face',    'faceIndex']
};

function idList(text) {
    return text.split(',').map(function(s) { return Number(s); })
        .filter(function(n) { return n > 0; });
}

// Returns { id: { bit: value } }  (id > 0 actor, id < 0 enemy, 0 = everyone)
function stateGraphics(state) {
    if (state._chad2Gfx) return state._chad2Gfx;
    var table = {};
    function put(ids, bit, value) {
        ids.forEach(function(id) {
            table[id] = table[id] || {};
            table[id][bit] = value;
        });
    }
    (state.note || '').split(/[\r\n]+/).forEach(function(line) {
        var m, kind;
        if ((m = line.match(RE_ACTOR))) {
            kind = KIND[m[1].toLowerCase()];
            put(idList(m[4]), kind[0], m[2]);
            put(idList(m[4]), kind[1], Number(m[3]));
        } else if ((m = line.match(RE_ENEMY))) {
            kind = KIND[m[1].toLowerCase()];
            var ids = idList(m[4]).map(function(n) { return -n; });
            put(ids, kind[0], m[2]);
            put(ids, kind[1], Number(m[3]));
        } else if ((m = line.match(RE_COMMON))) {
            kind = KIND[m[1].toLowerCase()];
            put([0], kind[0], m[2]);
            put([0], kind[1], Number(m[3]));
        } else if ((m = line.match(RE_NAME))) {
            var who = (m[1] || '').toLowerCase().trim();
            var list = who ? idList(m[3]) : [0];
            if (who === 'enemy') list = list.map(function(n) { return -n; });
            put(list, 'name', m[2]);
        }
    });
    state._chad2Gfx = table;
    return table;
}

Game_BattlerBase.prototype.stateGraphicBit = function(bit) {
    var id = this.isEnemy() ? -this._enemyId : this._actorId;
    var states = this.states();
    for (var i = 0; i < states.length; i++) {
        var table = stateGraphics(states[i]);
        if (table[id] && table[id][bit] !== undefined) return table[id][bit];
        if (table[0] && table[0][bit] !== undefined) return table[0][bit];
    }
    return undefined;
};

// Empty string means "keep the default graphic".
function pick(value, fallback) {
    return (value === undefined || value === '') ? fallback : value;
}

var _Game_Actor_faceName = Game_Actor.prototype.faceName;
Game_Actor.prototype.faceName = function() {
    return pick(this.stateGraphicBit('face'), _Game_Actor_faceName.call(this));
};

var _Game_Actor_faceIndex = Game_Actor.prototype.faceIndex;
Game_Actor.prototype.faceIndex = function() {
    return pick(this.stateGraphicBit('faceIndex'), _Game_Actor_faceIndex.call(this));
};

var _Game_Actor_characterName = Game_Actor.prototype.characterName;
Game_Actor.prototype.characterName = function() {
    return pick(this.stateGraphicBit('chara'), _Game_Actor_characterName.call(this));
};

var _Game_Actor_characterIndex = Game_Actor.prototype.characterIndex;
Game_Actor.prototype.characterIndex = function() {
    return pick(this.stateGraphicBit('charaIndex'), _Game_Actor_characterIndex.call(this));
};

var _Game_Actor_battlerName = Game_Actor.prototype.battlerName;
Game_Actor.prototype.battlerName = function() {
    if (this.isAlive()) this._chad2HeldBattler = this.stateGraphicBit('battler');
    return pick(this._chad2HeldBattler, _Game_Actor_battlerName.call(this));
};

var _Game_Actor_name = Game_Actor.prototype.name;
Game_Actor.prototype.name = function() {
    return pick(this.stateGraphicBit('name'), _Game_Actor_name.call(this));
};

var _Game_Enemy_battlerName = Game_Enemy.prototype.battlerName;
Game_Enemy.prototype.battlerName = function() {
    if (this.isAlive()) this._chad2HeldBattler = this.stateGraphicBit('battler');
    return pick(this._chad2HeldBattler, _Game_Enemy_battlerName.call(this));
};

var _Game_Enemy_battlerHue = Game_Enemy.prototype.battlerHue;
Game_Enemy.prototype.battlerHue = function() {
    return pick(this.stateGraphicBit('battlerHue'), _Game_Enemy_battlerHue.call(this));
};

var _Game_Enemy_originalName = Game_Enemy.prototype.originalName;
Game_Enemy.prototype.originalName = function() {
    return pick(this.stateGraphicBit('name'), _Game_Enemy_originalName.call(this));
};

// Keep the map sprites in sync when states change on actors.
// Only for states that change map graphics, and only for actors that are
// already registered (MV adds/removes states while constructing actors).
function refreshPlayerFor(battler, stateId) {
    if (!battler.isActor() || !$gamePlayer || !$gameActors) return;
    if ($gameActors._data[battler.actorId()] !== battler) return;
    var state = $dataStates[stateId];
    if (!state) return;
    var table = stateGraphics(state);
    var changesMap = Object.keys(table).some(function(id) {
        return table[id].chara !== undefined || table[id].charaIndex !== undefined;
    });
    if (changesMap) $gamePlayer.refresh();
}

var _Game_Battler_addState = Game_Battler.prototype.addState;
Game_Battler.prototype.addState = function(stateId) {
    _Game_Battler_addState.call(this, stateId);
    refreshPlayerFor(this, stateId);
};

var _Game_Battler_removeState = Game_Battler.prototype.removeState;
Game_Battler.prototype.removeState = function(stateId) {
    _Game_Battler_removeState.call(this, stateId);
    refreshPlayerFor(this, stateId);
};

})();
