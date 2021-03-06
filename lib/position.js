define(['allong.es', 'lib/constants', 'lib/util/export'], function(allong, C, Export) {
  var variadic = allong.es.variadic;

  var NUM_RANKS = C.NUM_RANKS;
  var NUM_CIRCLES = C.NUM_CIRCLES;
  var CAPITAL = C.CAPITAL;

  var Position = function(circle) {
    validateCircle(circle);

    return function(rank) {
      validateRank(circle, rank);
      return {
        circle: circle,
        rank: rank,
        asKey: function() {
          return asKey(circle, rank);
        },
        asHistoryKey: function() {
          return asHistoryKey(circle, rank);
        },
        adjacentPositions: function() {
          return adjacentPositions(circle, rank)
        },
        nextRank: function() {
          return Position.incrementRank(rank);
        },
        previousRank: function() {
          return Position.decrementRank(rank);
        },
        distanceTo: function(position) {
          if (circle === C.CAPITAL || position.circle === C.CAPITAL) {
            return 1;
          } else if (circle !== position.circle) {
            if (Math.abs(circle - position.circle) > 1) {
              throw "Distance across multiple circles is not supported";
            }
            return 2;
          }
          var diff = Math.abs(rank - position.rank);
          return Math.min(diff, NUM_RANKS-diff);
        }
      };
    };
  };

  Position.decrementRank = function(rank) {
    return (rank - 1 + NUM_RANKS) % NUM_RANKS;
  };
  Position.incrementRank = function(rank) {
    return (rank + 1) % NUM_RANKS;
  };

  var validateCircle = function(value) {
    if (value < 0 || value >= NUM_CIRCLES || isNaN(value) || !isFinite(value)) {
      throw "Invalid circle value";
    }
  };

  var validateRank = function(circle, rank) {
    if (rank < 0 || rank >= NUM_RANKS ||
      (circle === CAPITAL && rank > 0) || isNaN(rank) || !isFinite(rank)) {
      throw "Invalid rank value";
    }
  };

  var asKey = function(circle, rank) {
    return circle + "," + rank;
  };

  var asHistoryKey = function(circle, rank) {
    var result = "";
    if (circle === CAPITAL && rank === 0) {
      return "Capital";
    } else if (circle === CAPITAL - 1) {
      result = "Inner Circle ";
    }
    result += String.fromCharCode(('A'.charCodeAt(0) + (4 - circle))) + "," + rank;
    return result;
  };

  var adjacentPositions = function(circle, rank) {
    var possiblePositions = [];

    var make = function(circle, rank) {
      try {
        var pos = Position(circle)(rank);
        possiblePositions.push(pos);
      } catch (e) {
        if (e !== "Invalid circle value" && e !== "Invalid rank value") {
          throw e;
        }
      }
    };

    if (circle === CAPITAL) {
      for(var i = 0; i < NUM_RANKS; i++) {
        make(circle-1, i);
      }
    } else {
      make(circle-1, rank);
      make(circle-1, Position.incrementRank(rank));
      make(circle, Position.incrementRank(rank));
      make(circle, Position.decrementRank(rank));
      if (circle+1 === CAPITAL) {
        make(circle+1, 0);
      } else {
        make(circle+1, rank);
        make(circle+1, Position.decrementRank(rank));
      }
    }

    return possiblePositions;
  };

  var first_constructor = function(circle) {
    if (typeof circle === 'string') {
      var vals = circle.split(',');
      circle = parseInt(vals[0]);
      rank = parseInt(vals[1]);
      return Position(circle)(rank);
    }
    return Position(circle);
  };

  var helpers = {};
  helpers.incrementRank = Position.incrementRank;
  helpers.decrementRank = Position.decrementRank;

  return Export(first_constructor, helpers);
});
