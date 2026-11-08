//=============================================================================
// Chad2_EnemyScan.js
//=============================================================================
/*:
 * @plugindesc v1.0 Enemy info screen in battle (press Shift while choosing a
 * target). MV port of Neon Black's "CP Enemy Scan" as used in VX Ace.
 * @author Chad II team (original Ace script by Neon Black)
 *
 * @param Hint Text
 * @desc Shown while choosing an enemy target. Leave empty to hide.
 * @default Press shift for enemy info
 *
 * @param Weak Text
 * @default Weaknesses
 *
 * @param Resist Text
 * @default Resistances
 *
 * @param Discover Affinities
 * @desc true: weaknesses/resistances appear only after the party has hit
 * the enemy with that element/state. false: always shown.
 * @default true
 *
 * @param Element Icons
 * @desc elementId:iconIndex pairs separated by spaces (MV IconSet).
 * @default 1:76 2:84 3:64 4:65 5:66 6:67 7:68 8:69 9:70 10:71
 *
 * @param Scan States
 * @desc State IDs that can show up as weak/resist (uses database icons).
 * @default 1 2 3 4 5 6 7 8
 *
 * @help
 * ============================================================================
 * Controls
 * ============================================================================
 * While selecting an enemy target, press Shift to open the info screen.
 *   Page Up / Page Down (Q / W) : previous / next enemy
 *   Shift, Cancel or OK          : close and go back to target selection
 * Time does not pass while the info screen is open.
 *
 * The screen shows the enemy's name, states, HP, MP and TP, plus the
 * elements and states it is weak to or resists. With "Discover Affinities"
 * on, an element is revealed after the party hits that enemy type with it
 * and a state after the party tries to inflict it. Discoveries are saved
 * with the game.
 *
 * Enemy notetags (optional, same as Ace):
 *   hide hp   hide mp   hide tp     - show "? ? ?" instead of the value
 */
//=============================================================================

var Imported = Imported || {};
Imported.Chad2_EnemyScan = true;

(function() {
'use strict';

var P = PluginManager.parameters('Chad2_EnemyScan');
var HINT_TEXT   = String(P['Hint Text'] || '');
var WEAK_TEXT   = String(P['Weak Text'] || 'Weaknesses');
var RESIST_TEXT = String(P['Resist Text'] || 'Resistances');
var DISCOVER    = String(P['Discover Affinities'] || 'true') !== 'false';
var HIDDEN_TEXT = '? ? ?';

var ELEMENT_ICONS = [];  // [[elementId, icon], ...] in display order
String(P['Element Icons'] || '').split(/\s+/).forEach(function(pair) {
    var f = pair.split(':');
    if (f.length === 2) ELEMENT_ICONS.push([Number(f[0]), Number(f[1])]);
});
var SCAN_STATES = String(P['Scan States'] || '').split(/[\s,]+/)
    .map(Number).filter(function(n) { return n > 0; });

function hasElement(id) {
    return ELEMENT_ICONS.some(function(e) { return e[0] === id; });
}

//=============================================================================
// Game_System - remembered discoveries
//=============================================================================

Game_System.prototype.scanKnown = function(kind, enemyId) {
    this._chad2Scan = this._chad2Scan || { elements: {}, states: {} };
    var table = this._chad2Scan[kind];
    table[enemyId] = table[enemyId] || [];
    return table[enemyId];
};

Game_System.prototype.addScanKnown = function(kind, enemyId, id) {
    var list = this.scanKnown(kind, enemyId);
    if (list.indexOf(id) < 0) list.push(id);
};

//=============================================================================
// Game_Action - discovery
//=============================================================================

var _Game_Action_apply = Game_Action.prototype.apply;
Game_Action.prototype.apply = function(target) {
    _Game_Action_apply.call(this, target);
    if (!target.isEnemy() || !target.result().isHit()) return;
    var item = this.item();
    if (!item) return;
    var enemyId = target.enemyId();
    var elementId = item.damage.elementId;
    if (elementId < 0) {
        var elements = this.subject().attackElements();
        if (elements.length === 0) return;
        var max = this.elementsMaxRate(target, elements);
        elements.forEach(function(id) {
            if (target.elementRate(id) === max && hasElement(id)) {
                $gameSystem.addScanKnown('elements', enemyId, id);
            }
        });
    } else if (elementId > 0 && hasElement(elementId)) {
        $gameSystem.addScanKnown('elements', enemyId, elementId);
    }
};

function noteStateTry(target, stateId) {
    if (target.isEnemy() && SCAN_STATES.indexOf(stateId) >= 0) {
        $gameSystem.addScanKnown('states', target.enemyId(), stateId);
    }
}

var _Game_Action_itemEffectAddAttackState = Game_Action.prototype.itemEffectAddAttackState;
Game_Action.prototype.itemEffectAddAttackState = function(target, effect) {
    _Game_Action_itemEffectAddAttackState.call(this, target, effect);
    this.subject().attackStates().forEach(function(id) { noteStateTry(target, id); });
};

var _Game_Action_itemEffectAddNormalState = Game_Action.prototype.itemEffectAddNormalState;
Game_Action.prototype.itemEffectAddNormalState = function(target, effect) {
    _Game_Action_itemEffectAddNormalState.call(this, target, effect);
    noteStateTry(target, effect.dataId);
};

//=============================================================================
// Window_ChadScanEnemy - name / states / HP / MP / TP
//=============================================================================

function Window_ChadScanEnemy() {
    this.initialize.apply(this, arguments);
}

Window_ChadScanEnemy.prototype = Object.create(Window_Base.prototype);
Window_ChadScanEnemy.prototype.constructor = Window_ChadScanEnemy;

Window_ChadScanEnemy.prototype.initialize = function() {
    var width = 372;
    Window_Base.prototype.initialize.call(this, 0, 0, width, this.fittingHeight(3));
    this._enemy = null;
};

Window_ChadScanEnemy.prototype.setEnemy = function(enemy) {
    this._enemy = enemy;
    this.refresh();
};

Window_ChadScanEnemy.prototype.isHidden = function(stat) {
    var note = this._enemy.enemy().note || '';
    return new RegExp('hide ' + stat, 'i').test(note);
};

Window_ChadScanEnemy.prototype.drawStat = function(stat, x, y, width) {
    var e = this._enemy;
    var label = { hp: TextManager.hpA, mp: TextManager.mpA, tp: TextManager.tpA }[stat];
    var labelW = Math.min(44, Math.floor(width / 3));
    if (this.isHidden(stat)) {
        this.changeTextColor(this.systemColor());
        this.drawText(label, x, y, labelW);
        this.resetTextColor();
        this.drawText(HIDDEN_TEXT, x + labelW, y, width - labelW, 'right');
        return;
    }
    var rate, c1, c2, value, color;
    if (stat === 'hp') {
        rate = e.hpRate(); c1 = this.hpGaugeColor1(); c2 = this.hpGaugeColor2();
        value = e.hp; color = this.hpColor(e);
    } else if (stat === 'mp') {
        rate = e.mpRate(); c1 = this.mpGaugeColor1(); c2 = this.mpGaugeColor2();
        value = e.mp; color = this.mpColor(e);
    } else {
        rate = e.tpRate(); c1 = this.tpGaugeColor1(); c2 = this.tpGaugeColor2();
        value = e.tp; color = this.tpColor(e);
    }
    this.drawGauge(x, y, width, rate, c1, c2);
    this.changeTextColor(this.systemColor());
    this.drawText(label, x, y, labelW);
    this.changeTextColor(color);
    this.drawText(Math.floor(value), x + labelW, y, width - labelW, 'right');
};

Window_ChadScanEnemy.prototype.refresh = function() {
    this.contents.clear();
    if (!this._enemy) return;
    var w = this.contents.width;
    var lh = this.lineHeight();
    var half = Math.floor(w / 2);
    this.resetTextColor();
    this.drawText(this._enemy.name(), 2, 0, half + 100);
    this.drawActorIcons(this._enemy, half, 0, w - half);
    this.drawStat('hp', 2, lh, w - 4);
    this.drawStat('mp', 2, lh * 2, half - 6);
    this.drawStat('tp', half + 4, lh * 2, w - half - 6);
};

//=============================================================================
// Window_ChadScanAffinity - weaknesses / resistances
//=============================================================================

function Window_ChadScanAffinity() {
    this.initialize.apply(this, arguments);
}

Window_ChadScanAffinity.prototype = Object.create(Window_Base.prototype);
Window_ChadScanAffinity.prototype.constructor = Window_ChadScanAffinity;

Window_ChadScanAffinity.prototype.initialize = function() {
    var width = Graphics.boxWidth - 372;
    Window_Base.prototype.initialize.call(this, 372, 0, width, this.fittingHeight(3));
    this._enemy = null;
};

Window_ChadScanAffinity.prototype.setEnemy = function(enemy) {
    this._enemy = enemy;
    this.refresh();
};

Window_ChadScanAffinity.prototype.knownElement = function(id) {
    return !DISCOVER ||
        $gameSystem.scanKnown('elements', this._enemy.enemyId()).indexOf(id) >= 0;
};

Window_ChadScanAffinity.prototype.knownState = function(id) {
    return !DISCOVER ||
        $gameSystem.scanKnown('states', this._enemy.enemyId()).indexOf(id) >= 0;
};

Window_ChadScanAffinity.prototype.icons = function(weak) {
    var e = this._enemy;
    var result = [];
    ELEMENT_ICONS.forEach(function(pair) {
        var rate = e.elementRate(pair[0]);
        if ((weak ? rate > 1 : rate < 1) && this.knownElement(pair[0])) {
            result.push(pair[1]);
        }
    }, this);
    SCAN_STATES.forEach(function(id) {
        var state = $dataStates[id];
        if (!state) return;
        var rate = e.stateRate(id);
        var resist = e.isStateResist(id);
        var match = weak ? (rate > 1 && !resist) : (rate < 1 || resist);
        if (match && this.knownState(id)) result.push(state.iconIndex);
    }, this);
    return result;
};

Window_ChadScanAffinity.prototype.drawIconColumn = function(title, icons, x, width) {
    var iw = Window_Base._iconWidth;
    var perRow = Math.max(1, Math.floor(width / iw));
    this.changeTextColor(this.systemColor());
    this.drawText(title, x, 0, width, 'center');
    icons.forEach(function(icon, i) {
        this.drawIcon(icon, x + iw * (i % perRow),
            this.lineHeight() + iw * Math.floor(i / perRow));
    }, this);
};

Window_ChadScanAffinity.prototype.refresh = function() {
    this.contents.clear();
    if (!this._enemy) return;
    var half = Math.floor(this.contents.width / 2);
    this.drawIconColumn(WEAK_TEXT, this.icons(true), 0, half - 6);
    this.drawIconColumn(RESIST_TEXT, this.icons(false), half + 6, half - 6);
};

//=============================================================================
// Window_ChadScanHint - "Press shift for enemy info"
//=============================================================================

function Window_ChadScanHint() {
    this.initialize.apply(this, arguments);
}

Window_ChadScanHint.prototype = Object.create(Window_Base.prototype);
Window_ChadScanHint.prototype.constructor = Window_ChadScanHint;

Window_ChadScanHint.prototype.initialize = function() {
    Window_Base.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, this.fittingHeight(1));
    var width = this.textWidth(HINT_TEXT) + this.standardPadding() * 2 + this.textPadding() * 2;
    this.width = Math.min(Graphics.boxWidth, Math.ceil(width));
    this.createContents();
    this.drawText(HINT_TEXT, this.textPadding(), 0, this.contents.width - this.textPadding() * 2);
    this.visible = false;
};

//=============================================================================
// Scene_Battle
//=============================================================================

var _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function() {
    _Scene_Battle_createAllWindows.call(this);
    this._scanEnemyWindow = new Window_ChadScanEnemy();
    this._scanAffinityWindow = new Window_ChadScanAffinity();
    this._scanEnemyWindow.visible = false;
    this._scanAffinityWindow.visible = false;
    this.addWindow(this._scanEnemyWindow);
    this.addWindow(this._scanAffinityWindow);
    if (HINT_TEXT) {
        this._scanHintWindow = new Window_ChadScanHint();
        this._scanHintWindow.x = Graphics.boxWidth - this._scanHintWindow.width;
        this._scanHintWindow.y = this._enemyWindow.y - this._scanHintWindow.height;
        this.addWindow(this._scanHintWindow);
    }
    this._scanOpen = false;
};

var _Scene_Battle_isAnyInputWindowActive = Scene_Battle.prototype.isAnyInputWindowActive;
Scene_Battle.prototype.isAnyInputWindowActive = function() {
    return this._scanOpen || _Scene_Battle_isAnyInputWindowActive.call(this);
};

var _Scene_Battle_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
    if (this._scanOpen) {
        this.updateEnemyScan();
    } else if (this._enemyWindow && this._enemyWindow.active &&
            Input.isTriggered('shift') && $gameTroop.aliveMembers().length > 0) {
        this.openEnemyScan();
    }
    _Scene_Battle_update.call(this);
    if (this._scanHintWindow) {
        this._scanHintWindow.visible = !this._scanOpen &&
            this._enemyWindow.active && this._enemyWindow.visible;
    }
};

Scene_Battle.prototype.openEnemyScan = function() {
    SoundManager.playOk();
    this._scanOpen = true;
    this._scanIndex = Math.max(0, this._enemyWindow.index());
    this._scanHidden = [];
    this._windowLayer.children.forEach(function(win) {
        if (win.visible && win !== this._scanEnemyWindow &&
                win !== this._scanAffinityWindow) {
            this._scanHidden.push(win);
            win.visible = false;
        }
    }, this);
    this._enemyWindow.deactivate();
    this._scanEnemyWindow.visible = true;
    this._scanAffinityWindow.visible = true;
    this.refreshEnemyScan();
};

Scene_Battle.prototype.refreshEnemyScan = function() {
    var enemies = $gameTroop.aliveMembers();
    if (enemies.length === 0) return;
    this._scanIndex = (this._scanIndex + enemies.length) % enemies.length;
    var enemy = enemies[this._scanIndex];
    $gameTroop.select(enemy);
    this._scanEnemyWindow.setEnemy(enemy);
    this._scanAffinityWindow.setEnemy(enemy);
};

Scene_Battle.prototype.updateEnemyScan = function() {
    if (Input.isTriggered('shift') || Input.isTriggered('cancel') ||
            Input.isTriggered('ok') || TouchInput.isCancelled() ||
            TouchInput.isTriggered()) {
        this.closeEnemyScan();
    } else if (Input.isTriggered('pagedown') || Input.isRepeated('right')) {
        SoundManager.playCursor();
        this._scanIndex++;
        this.refreshEnemyScan();
    } else if (Input.isTriggered('pageup') || Input.isRepeated('left')) {
        SoundManager.playCursor();
        this._scanIndex--;
        this.refreshEnemyScan();
    }
};

Scene_Battle.prototype.closeEnemyScan = function() {
    SoundManager.playCancel();
    this._scanOpen = false;
    this._scanEnemyWindow.visible = false;
    this._scanAffinityWindow.visible = false;
    this._scanHidden.forEach(function(win) { win.visible = true; });
    this._scanHidden = [];
    this._enemyWindow.select(this._enemyWindow.index());
    this._enemyWindow.activate();
    Input.clear();
    TouchInput.clear();
};

})();
