define(['lib/helpers', 'lib/infowar'], function(h, Infowar) {
var Position = h.Position;
var Pieces = h.Pieces;
var InsurgentMove = h.InsurgentMove;
var StateMove = h.StateMove;
var History = h.History;

var initInsurgents = function(infowar) {
  var positions = [
    Position(0)(0),
    Position(0)(2),
    Position(0)(4),
    Position(0)(6),
    Position(0)(8)
  ];
  for (var i = 0; i < positions.length; i++) {
    infowar.addInsurgent(positions[i]);
  }
  return positions;
};

describe("infowar", function() {
  var infowar;

  describe("initial setup", function() {
    beforeEach(function() {
      infowar = Infowar();
    });

    it("should be no one's turn", function() {
      expect(infowar.currentTurn()).toBe(undefined);
    });
    it("should be the setup phase", function() {
      expect(infowar.currentPhase()).toBe(h.C.SETUP);
    });
    it("should have five state pieces in the capital", function() {
      var pieces = infowar.getPiecesAt(Position(4)(0));
      expect(pieces.length).toBe(5);
      for (var i = 0; i < pieces.length; i++) {
        expect(pieces[i].type()).toBe(Pieces.STATE_TYPE);
      }
    });
    it("should record the initial states pieces in the history log", function() {
      var history = infowar.history();
      expect(history.length).toBe(5);
      for (var i = 0; i < 5; i++) {
        var move = history[i];
        expect(move.player()).toBe(Infowar.STATE);
      }
    });
    describe("insurgent placement", function() {
      it("should indicate that five insurgents can be placed", function() {
        expect(infowar.initialInsurgents()).toBe(5);
      });
      it("should not accept too many placements", function() {
        initInsurgents(infowar);
        expect(function() {
          infowar.addInsurgent(Position(0)(0));
        }).toThrow("Cannot add more insurgents!");
      });
      it("should decrease initial insurgents as pieces are added", function() {
        infowar.addInsurgent(Position(0)(0));
        expect(infowar.initialInsurgents()).toBe(4);
        infowar.addInsurgent(Position(0)(2));
        expect(infowar.initialInsurgents()).toBe(3);
        infowar.addInsurgent(Position(0)(4));
        expect(infowar.initialInsurgents()).toBe(2);
        infowar.addInsurgent(Position(0)(6));
        expect(infowar.initialInsurgents()).toBe(1);
        infowar.addInsurgent(Position(0)(8));
        expect(infowar.initialInsurgents()).toBe(0);
      });
      it("should accept arbitrary positions in the outer ring for insurgents", function() {
        var positions = [
          Position(0)(0),
          Position(0)(2),
          Position(0)(4),
          Position(0)(6),
          Position(0)(8)
        ];
        for (var i = 0; i < positions.length; i++) {
          infowar.addInsurgent(positions[i]);
        }
        for (var i = 0; i < positions.length; i++) {
          var pieces = infowar.getPiecesAt(positions[i]);
          expect(pieces.length).toBe(1);
          expect(pieces[0].type()).toBe(Pieces.INSURGENT_TYPE);
        }
      });
      it("should not permit insurgents in other rings", function() {
        for (var i = 1; i < h.C.NUM_CIRCLES; i++) {
          expect(function() {
            infowar.addInsurgent(Position(i)(0));
          }).toThrow("Invalid placement!");
        }
      });
      it("should permit insurgents to all start on the same spot", function() {
        var pos = Position(0)(0);
        for (var i = 0; i < 5; i++) {
          infowar.addInsurgent(pos);
        }
        var pieces = infowar.getPiecesAt(pos);
        expect(pieces.length).toBe(5);
        for (var i = 0; i < 5; i++) {
          expect(pieces[i].type()).toBe(Pieces.INSURGENT_TYPE);
        }
      });
      it("should indicate that it's the insurgent's turn after placement", function() {
        initInsurgents(infowar);
        expect(infowar.currentTurn()).toBe(Infowar.INSURGENT);
      });
      it("should change the phase to playing", function() {
        initInsurgents(infowar);
        expect(infowar.currentPhase()).toBe(h.C.PLAYING);
      });
      it("should add entries into the history log", function() {
        for (var i = 0; i < 5; i++) {
          infowar.addInsurgent(Position(0)(i));
        }
        var history = infowar.history();
        expect(history.length).toBe(10);
        for (var i = 0; i < 5; i++) {
          var entry = history[i+5];
          expect(entry.player()).toBe(Infowar.INSURGENT);
          expect(entry.position()).toBeDefined();
          expect(entry.position().asKey()).toBe(Position(0)(i).asKey());
        }
      });
    });
  });

  describe("creating from history", function() {
    var history;
    beforeEach(function() {
      history = [];
      for (var i = 0; i < 5; i++) {
        history.push(History.Placement(Infowar.STATE, Position(h.C.CAPITAL)(0)));
      }
      infowar = Infowar(history);
    });
    describe("with minimal history", function() {
      it("should be at the same state after initial creation", function() {
        expect(infowar.getPiecesAt(Position(h.C.CAPITAL)(0))).toBeDefined();
        expect(infowar.getPiecesAt(Position(h.C.CAPITAL)(0)).length).toEqual(5);
      });
      it("should use the same history", function() {
        expect(infowar.history().length).toBe(history.length);
        for (var i = 0; i < history.length; i++) {
          expect(infowar.history()[i].type()).toEqual(history[i].type());
          expect(infowar.history()[i].player()).toEqual(history[i].player());
          expect(infowar.history()[i].position().asKey()).toEqual(history[i].position().asKey());
        }
      });
    });
    describe("with insurgents placed", function() {
      beforeEach(function() {
        for (var i = 0; i < 5; i++) {
          history.push(History.Placement(Infowar.INSURGENT, Position(0)(0)));
        }
      });
      it("should be at the same state after placing insurgents", function() {
        var infowar = Infowar(history);
        expect(infowar.getPiecesAt(Position(0)(0))).toBeDefined();
        expect(infowar.getPiecesAt(Position(0)(0)).length).toEqual(5);
      });
    });
    describe("with some moves", function() {
      beforeEach(function() {
        for (var i = 0; i < 5; i++) {
          history.push(History.Placement(Infowar.INSURGENT, Position(0)(0)));
        }
        history.push(History.Move(Infowar.INSURGENT, InsurgentMove(Position(0)(0))(Position(1)(0))));
        history.push(History.Move(Infowar.STATE, StateMove(Position(h.C.CAPITAL)(0))(Position(3)(0))));
        history.push(History.Move(Infowar.INSURGENT, InsurgentMove(Position(1)(0))(Position(2)(0))));

        infowar = Infowar(history);
      });
      it("should be at the same state", function() {
        expect(infowar.currentTurn()).toBe(Infowar.STATE);
        expect(infowar.getPiecesAt(Position(1)(0))).toBeUndefined();
        expect(infowar.getPiecesAt(Position(2)(0))).toBeDefined();
        expect(infowar.getPiecesAt(Position(2)(0))[0].type()).toBe(Pieces.INSURGENT_TYPE);
        expect(infowar.getPiecesAt(Position(3)(0))).toBeDefined();
        expect(infowar.getPiecesAt(Position(3)(0))[0].type()).toBe(Pieces.STATE_TYPE);
        expect(infowar.getPiecesAt(Position(0)(0)).length).toBe(4);
        expect(infowar.getPiecesAt(Position(h.C.CAPITAL)(0)).length).toBe(4);
      });
    });
    describe("with an invalid history", function() {
      beforeEach(function() {
        for (var i = 0; i < 5; i++) {
          history.push(History.Placement(Infowar.INSURGENT, Position(0)(0)));
        }
      });
      it("should not permit illegal moves", function() {
        history.push(History.Move(Infowar.STATE, StateMove(Position(h.C.CAPITAL)(0), Position(3)(0))));
        expect(function() {
          infowar = Infowar(history);
        }).toThrow("It's not your turn!");
      });
      it("should not permit arbitrary placement", function() {
        history.push(History.Placement(Infowar.INSURGENT, Position(3)(0)));
        expect(function() {
          infowar = Infowar(history);
        }).toThrow("Invalid placement!");
      });
    });
  });

  describe("insurgent turn", function() {
    beforeEach(function() {
      infowar = Infowar();
      infowar.addInsurgent(Position(0)(0));
      infowar.addInsurgent(Position(0)(2));
      infowar.addInsurgent(Position(0)(4));
      infowar.addInsurgent(Position(0)(6));
      infowar.addInsurgent(Position(0)(8));
    });
    it("should change to state's turn after insurgent finishes turn", function() {
      var src = Position(0)(2);
      var dest = Position(1)(2);
      infowar.insurgentMove(src, dest);
      expect(infowar.getPiecesAt(src)).toBe(undefined);
      expect(infowar.getPiecesAt(dest).length).toBe(1);
      expect(infowar.currentTurn()).toBe(Infowar.STATE);
    });
    it("should throw if a state's move is given", function() {
      expect(function() {
        infowar.stateMove(Position(1)(2), Position(2)(2));
      }).toThrow("It's not your turn!");
    });
    it("should not change to the state's turn until the turn is complete", function() {
      var src = Position(0)(2);
      var dest = Position(0)(3);
      infowar.insurgentMove(src, dest);
      expect(infowar.getPiecesAt(src)).toBe(undefined);
      expect(infowar.getPiecesAt(dest).length).toBe(1);
      expect(infowar.currentTurn()).toBe(Infowar.INSURGENT);
    });
    it("should add an entry in the log", function() {
      var src = Position(0)(2);
      var dest = Position(0)(4);
      infowar.insurgentMove(src, dest);
      var history = infowar.history();
      expect(history.length).toBe(11);
      var entry = history[10];
      expect(entry).toBeDefined();
      expect(entry.player()).toBe(Infowar.INSURGENT);
      expect(entry.type()).toBe(h.C.MOVE);
      expect(entry.move().src.asKey()).toBe(src.asKey());
      expect(entry.move().dest.asKey()).toBe(dest.asKey());
    });
  });
  describe("state turn", function() {
    beforeEach(function() {
      infowar = Infowar();
      for (var i = 0; i < Infowar.INITIAL_INSURGENTS; i++) {
        infowar.addInsurgent(Position(0)(i));
      }
      infowar.insurgentMove(Position(0)(2), Position(1)(2));
    });
    it("should throw if an insurgent's move is given", function() {
      expect(function() {
        infowar.insurgentMove(Position(1)(2), Position(2)(2));
      }).toThrow("It's not your turn!");
    });
    it("should change to insurgent's turn after state finishes turn", function() {
      var src = Position(4)(0);
      var dest = Position(3)(0);
      infowar.stateMove(src, dest);
      expect(infowar.getPiecesAt(src).length).toBe(4);
      expect(infowar.getPiecesAt(dest).length).toBe(1);
      expect(infowar.currentTurn()).toBe(Infowar.INSURGENT);
    });
    it("should add an entry in the log", function() {
      var src = Position(4)(0);
      var dest = Position(3)(0);
      infowar.stateMove(src, dest);
      var history = infowar.history();
      expect(history.length).toBe(12);
      var entry = history[11];
      expect(entry).toBeDefined();
      expect(entry.player()).toBe(Infowar.STATE);
      expect(entry.type()).toBe(h.C.MOVE);
      expect(entry.move().src.asKey()).toBe(src.asKey());
      expect(entry.move().dest.asKey()).toBe(dest.asKey());
    });
  });
  describe("insurgents hold four adjacent spaces in the inner ring", function() {
    beforeEach(function() {
      infowar = Infowar();
      for (var i = 0; i < Infowar.INITIAL_INSURGENTS; i++) {
        infowar.addInsurgent(Position(0)(0));
      }
      var state_src = Position(4)(0);
      var state_dest = Position(3)(0);
      var moveState = function() {
        infowar.stateMove(state_src, state_dest);
        var tmp = state_src;
        state_src = state_dest;
        state_dest = tmp;
      };
      for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 3; j++) {
          infowar.insurgentMove(Position(j)(0), Position(j+1)(0));
          moveState();
        }
      }
      // Four insurgents should be at 3,0
      infowar.insurgentMove(Position(3)(0), Position(3)(2));
      moveState();
      infowar.insurgentMove(Position(3)(0), Position(3)(1));
      infowar.insurgentMove(Position(3)(0), Position(3)(11));
      // Four adjacent spaces now occupied: 3,11 to 3,2
    });
    it("should end the game", function() {
      expect(infowar.currentTurn()).toBe(undefined);
      expect(infowar.currentPhase()).toBe(h.C.GAMEOVER);
    });
  });
});
return {
  name: 'infowar_spec'
};
});
