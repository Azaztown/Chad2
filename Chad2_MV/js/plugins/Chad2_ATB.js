//=============================================================================
// Chad2_ATB.js
//=============================================================================
/*:
 * @plugindesc v1.0 Active Time Battle for Chad II. MV port of Fomar0153's
 * "Customisable ATB/Stamina Based Battle System" v1.3 as used in VX Ace.
 * @author Chad II team (original Ace script by Fomar0153)
 *
 * @param Max Stamina
 * @desc Stamina needed before a battler can act.
 * @default 1000
 *
 * @param Start Percent
 * @desc Battlers start each battle with a random 0..X% of max stamina.
 * @default 20
 *
 * @param Reset Actor Stamina
 * @desc true: actors also start with random stamina. false: only enemies.
 * @default true
 *
 * @param Action Cost
 * @desc Stamina spent when a battler uses a skill or item.
 * @default 1000
 *
 * @param Escape Cost
 * @desc Stamina each actor loses when an escape attempt fails.
 * @default 500
 *
 * @param Frames Per Turn
 * @desc Frames of gauge filling that count as one battle "turn" (for
 * state/buff durations, regen and troop event turn counts). 240 = 4 sec.
 * @default 240
 *
 * @param Default Gauge Colors
 * @desc Text color indices "fill, empty" for the ATB bar.
 * @default 31, 32
 *
 * @param State Speed Modifiers
 * @desc stateId:multiplier:fillColor:emptyColor, separated by ";".
 * Ace values (states 10/11/12 = Immortal/Cover/Provoke in this game).
 * @default 10:2:4:32; 11:0:8:32; 12:0.5:8:32
 *
 * @help
 * ============================================================================
 * How it works (same rules as the Ace version)
 * ============================================================================
 * - Every battler has a stamina bar. Each frame it fills by
 *     floor((2 + floor(AGI / 10)) * multiplier)
 *   where multiplier is the product of the "State Speed Modifiers" of the
 *   battler's states. Battlers that cannot move do not fill.
 * - When a bar is full the battler acts. Actors who can be controlled get
 *   their command window; time stops while you choose.
 * - Using a skill or item costs "Action Cost" stamina.
 * - Every "Frames Per Turn" frames of filling counts as one turn: states
 *   and buffs tick down, regeneration/slip damage happens and the troop
 *   turn counter goes up.
 * - Battle starts with the Fight / Escape window. Press Cancel while the
 *   bars are filling to bring it back. Cancel on an actor's command window
 *   also opens it; "Fight" returns to that actor.
 * - Escape: the attempt is made once every movable party member's bar is
 *   full. On failure each actor loses "Escape Cost" stamina.
 *
 * Place this plugin below YEP_CoreEngine.
 */
//=============================================================================

var Imported = Imported || {};
Imported.Chad2_ATB = true;

(function() {
'use strict';

var P = PluginManager.parameters('Chad2_ATB');
var MAX_STAMINA   = Number(P['Max Stamina'] || 1000);
var START_PERCENT = Number(P['Start Percent'] || 20);
var RESET_ACTORS  = String(P['Reset Actor Stamina'] || 'true') !== 'false';
var ACTION_COST   = Number(P['Action Cost'] || 1000);
var ESCAPE_COST   = Number(P['Escape Cost'] || 500);
var TURN_FRAMES   = Number(P['Frames Per Turn'] || 240);

var DEFAULT_COLORS = (function() {
    var c = String(P['Default Gauge Colors'] || '31, 32').split(',').map(Number);
    return { mult: 1, fill: c[0] || 31, empty: c[1] || 32 };
})();

var SPEED_STATES = (function() {
    var table = {};
    String(P['State Speed Modifiers'] || '').split(';').forEach(function(entry) {
        var f = entry.trim().split(':').map(function(s) { return s.trim(); });
        if (f.length < 2 || !f[0]) return;
        table[Number(f[0])] = {
            mult:  Number(f[1]),
            fill:  f[2] !== undefined ? Number(f[2]) : DEFAULT_COLORS.fill,
            empty: f[3] !== undefined ? Number(f[3]) : DEFAULT_COLORS.empty
        };
    });
    return table;
})();

//=============================================================================
// Game_Battler - stamina
//=============================================================================

Game_BattlerBase.prototype.atbStamina = function() {
    return this._atbStamina || 0;
};

Game_BattlerBase.prototype.setAtbStamina = function(value) {
    this._atbStamina = Math.max(0, Math.min(MAX_STAMINA, value));
};

Game_BattlerBase.prototype.atbRate = function() {
    return this.atbStamina() / MAX_STAMINA;
};

Game_BattlerBase.prototype.isAtbReady = function() {
    return this.atbStamina() >= MAX_STAMINA;
};

Game_BattlerBase.prototype.atbSpeedMultiplier = function() {
    var mult = 1;
    this._states.forEach(function(stateId) {
        if (SPEED_STATES[stateId]) mult *= SPEED_STATES[stateId].mult;
    });
    return mult;
};

// Same rule as Ace: the slowest modifier wins the bar colour.
Game_BattlerBase.prototype.atbColors = function() {
    var colors = DEFAULT_COLORS;
    this._states.forEach(function(stateId) {
        var spec = SPEED_STATES[stateId];
        if (spec && (spec.mult < colors.mult || colors.mult === 1)) colors = spec;
    });
    return colors;
};

Game_BattlerBase.prototype.atbGain = function() {
    if (!this.canMove()) return;
    var gain = (2 + Math.max(0, Math.floor(this.agi / 10))) * this.atbSpeedMultiplier();
    this.setAtbStamina(this.atbStamina() + Math.floor(gain));
};

var _Game_Battler_onBattleEnd = Game_Battler.prototype.onBattleEnd;
Game_Battler.prototype.onBattleEnd = function() {
    _Game_Battler_onBattleEnd.call(this);
    this._atbStamina = 0;
};

//=============================================================================
// BattleManager
//=============================================================================

var _BattleManager_setup = BattleManager.setup;
BattleManager.setup = function(troopId, canEscape, canLose) {
    _BattleManager_setup.call(this, troopId, canEscape, canLose);
    this._atbTurnTimer = 0;
    this._atbEscaping = false;
    this._atbPartyCommand = false;
};

var _BattleManager_startBattle = BattleManager.startBattle;
BattleManager.startBattle = function() {
    _BattleManager_startBattle.call(this);
    var cap = Math.floor(MAX_STAMINA * START_PERCENT / 100);
    $gameParty.members().forEach(function(actor) {
        if (this._preemptive) {
            actor.setAtbStamina(MAX_STAMINA);
        } else if (RESET_ACTORS) {
            actor.setAtbStamina(Math.randomInt(cap));
        }
    }, this);
    $gameTroop.members().forEach(function(enemy) {
        enemy.setAtbStamina(this._surprise ? MAX_STAMINA : Math.randomInt(cap));
    }, this);
};

BattleManager.isAtbPartyCommand = function() {
    return this._phase === 'input' && this._atbPartyCommand;
};

BattleManager.isAtbFilling = function() {
    return this._phase === 'atb';
};

BattleManager.update = function() {
    if (!this.isBusy() && !this.updateEvent()) {
        switch (this._phase) {
        case 'start':
            this.startInput();
            break;
        case 'atb':
            this.updateAtb();
            break;
        case 'turn':
            this.updateTurn();
            break;
        case 'action':
            this.updateAction();
            break;
        case 'turnEnd':
            this.updateTurnEnd();
            break;
        case 'battleEnd':
            this.updateBattleEnd();
            break;
        }
    }
};

BattleManager.updateEvent = function() {
    switch (this._phase) {
        case 'start':
        case 'atb':
        case 'turn':
        case 'turnEnd':
            if (this.isActionForced()) {
                this.processForcedAction();
                return true;
            } else {
                return this.updateEventMain();
            }
    }
    return this.checkAbort2();
};

// Called once after the battle start messages.
BattleManager.startInput = function() {
    this.clearActor();
    if ($gameTroop.turnCount() === 0) $gameTroop.increaseTurn();
    if (!this._surprise && $gameParty.canInput()) {
        this._phase = 'input';
        this._atbPartyCommand = true;
    } else {
        this._phase = 'atb';
    }
};

BattleManager.updateAtb = function() {
    if ((Input.isTriggered('cancel') || TouchInput.isCancelled()) &&
            $gameParty.canInput()) {
        this.clearActor();
        this._atbPartyCommand = true;
        this._phase = 'input';
        return;
    }
    if (this._atbEscaping && this.isAtbEscapeReady()) {
        this._atbEscaping = false;
        this.processAtbEscape();
        return;
    }
    var battler = this.atbReadyBattler();
    if (battler) {
        this.startAtbBattler(battler);
        return;
    }
    this.allBattleMembers().forEach(function(member) {
        member.atbGain();
    });
    this._atbTurnTimer++;
    if (TURN_FRAMES > 0 && this._atbTurnTimer >= TURN_FRAMES) {
        this._atbTurnTimer = 0;
        this.endTurn();
    }
};

BattleManager.atbReadyBattler = function() {
    var members = this.allBattleMembers();
    for (var i = 0; i < members.length; i++) {
        var b = members[i];
        if (!b.canMove() || !b.isAtbReady()) continue;
        if (this._atbEscaping && b.isActor()) continue;
        return b;
    }
    return null;
};

BattleManager.isAtbEscapeReady = function() {
    var members = $gameParty.movableMembers();
    return members.length > 0 && members.every(function(actor) {
        return actor.isAtbReady();
    });
};

BattleManager.startAtbBattler = function(battler) {
    battler.makeActions();
    if (battler.isActor() && battler.canInput()) {
        this._atbPartyCommand = false;
        this._phase = 'input';
        this.changeActor(battler.index(), '');
    } else {
        this.startAtbSubject(battler);
    }
};

BattleManager.startAtbSubject = function(battler) {
    this._subject = battler;
    this._atbPaid = false;
    this._phase = 'turn';
    $gameParty.requestMotionRefresh();
};

BattleManager.selectNextCommand = function() {
    if (this._atbPartyCommand) {
        // "Fight" in the party command window
        this._atbPartyCommand = false;
        this._atbEscaping = false;
        if (!this.actor()) this._phase = 'atb';
        return;
    }
    var actor = this.actor();
    if (!actor) {
        this._phase = 'atb';
        return;
    }
    if (actor.selectNextCommand()) return;
    this.changeActor(-1, 'waiting');
    this.startAtbSubject(actor);
};

BattleManager.selectPreviousCommand = function() {
    var actor = this.actor();
    if (actor && actor.selectPreviousCommand()) return;
    this._atbPartyCommand = true;
};

BattleManager.startAtbEscape = function() {
    this._atbPartyCommand = false;
    this._atbEscaping = true;
    var actor = this.actor();
    if (actor) {
        actor.clearActions();
        this.changeActor(-1, 'undecided');
    }
    this._phase = 'atb';
};

BattleManager.processAtbEscape = function() {
    $gameParty.performEscape();
    SoundManager.playEscape();
    var success = this._preemptive ? true : (Math.random() < this._escapeRatio);
    if (success) {
        $gameParty.removeBattleStates();
        this.displayEscapeSuccessMessage();
        this._escaped = true;
        this.processAbort();
    } else {
        this.displayEscapeFailureMessage();
        this._escapeRatio += 0.1;
        $gameParty.members().forEach(function(actor) {
            actor.clearActions();
            actor.setAtbStamina(actor.atbStamina() - ESCAPE_COST);
        });
        $gameParty.requestMotionRefresh();
    }
    return success;
};

// Kept for any plugin or event that calls the default escape directly.
BattleManager.processEscape = function() {
    return this.processAtbEscape();
};

BattleManager.updateTurn = function() {
    $gameParty.requestMotionRefresh();
    if (this._subject) {
        this.processTurn();
    } else {
        this._phase = 'atb';
    }
};

BattleManager.processTurn = function() {
    var subject = this._subject;
    var action = subject.currentAction();
    if (action) {
        action.prepare();
        if (action.isValid()) {
            this.startAction();
        }
        subject.removeCurrentAction();
    } else {
        // A battler that ends up doing nothing still spends its bar, so it
        // cannot block time from moving forward.
        if (!this._atbPaid) {
            subject.setAtbStamina(subject.atbStamina() - ACTION_COST);
        }
        subject.onAllActionsEnd();
        this.refreshStatus();
        this._logWindow.displayAutoAffectedStatus(subject);
        this._logWindow.displayCurrentState(subject);
        this._logWindow.displayRegeneration(subject);
        this._subject = null;
    }
};

var _BattleManager_startAction = BattleManager.startAction;
BattleManager.startAction = function() {
    var subject = this._subject;
    if (subject) {
        subject.setAtbStamina(subject.atbStamina() - ACTION_COST);
        this._atbPaid = true;
    }
    _BattleManager_startAction.call(this);
};

BattleManager.endTurn = function() {
    this._phase = 'turnEnd';
    this._preemptive = false;
    this._surprise = false;
    this.allBattleMembers().forEach(function(battler) {
        battler.onTurnEnd();
        this.refreshStatus();
        this._logWindow.displayAutoAffectedStatus(battler);
        this._logWindow.displayRegeneration(battler);
    }, this);
};

BattleManager.updateTurnEnd = function() {
    $gameTroop.increaseTurn();
    this._phase = 'atb';
};

//=============================================================================
// Scene_Battle
//=============================================================================

Scene_Battle.prototype.changeInputWindow = function() {
    if (BattleManager.isInputting()) {
        if (BattleManager.isAtbPartyCommand() || !BattleManager.actor()) {
            this.startPartyCommandSelection();
        } else {
            this.startActorCommandSelection();
        }
    } else {
        this.endCommandSelection();
    }
};

Scene_Battle.prototype.commandEscape = function() {
    BattleManager.startAtbEscape();
    this.changeInputWindow();
};

//=============================================================================
// Window_BattleStatus - ATB bar under each actor's name
//=============================================================================

Window_BattleStatus.prototype.atbBarRect = function(index) {
    var rect = this.basicAreaRect(index);
    var width = 150;
    if (Imported.YEP_CoreEngine) {
        var nameLength = this.textWidth('0') * 16 + 6;
        var iconWidth = Math.max(rect.width - nameLength, Window_Base._iconWidth * 2);
        width = rect.width - iconWidth;
    }
    width = Math.max(24, Math.min(width, rect.width));
    return new Rectangle(rect.x, rect.y + this.lineHeight() - 8, width, 6);
};

Window_BattleStatus.prototype.drawAtbBar = function(index) {
    var actor = $gameParty.battleMembers()[index];
    if (!actor) return;
    var r = this.atbBarRect(index);
    var colors = actor.atbColors();
    var fillW = Math.floor(r.width * actor.atbRate());
    this.contents.clearRect(r.x, r.y, r.width, r.height);
    this.contents.fillRect(r.x, r.y, r.width, r.height, this.gaugeBackColor());
    this.contents.gradientFillRect(r.x, r.y, fillW, r.height,
        this.textColor(colors.empty), this.textColor(colors.fill));
    this._atbDrawn = this._atbDrawn || [];
    this._atbDrawn[index] = fillW + ':' + colors.fill;
};

var _Window_BattleStatus_drawItem = Window_BattleStatus.prototype.drawItem;
Window_BattleStatus.prototype.drawItem = function(index) {
    _Window_BattleStatus_drawItem.call(this, index);
    if ($gameParty.inBattle()) this.drawAtbBar(index);
};

var _Window_BattleStatus_update = Window_BattleStatus.prototype.update;
Window_BattleStatus.prototype.update = function() {
    _Window_BattleStatus_update.call(this);
    if (!$gameParty.inBattle() || !this.contents) return;
    var members = $gameParty.battleMembers();
    this._atbDrawn = this._atbDrawn || [];
    for (var i = 0; i < members.length; i++) {
        var r = this.atbBarRect(i);
        var key = Math.floor(r.width * members[i].atbRate()) + ':' +
            members[i].atbColors().fill;
        if (this._atbDrawn[i] !== key) this.drawAtbBar(i);
    }
};

})();
