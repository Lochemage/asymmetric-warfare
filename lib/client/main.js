requirejs.config({
  baseUrl: 'client',
  paths: {
    lib: '../lib',
    underscore: "../js/underscore/underscore"
  },
  shim: {
    underscore: {
      exports: '_'
    }
  }
});

require(["underscore", "lib/helper", "lib/infochess", "lib/building_board"], function(_, HelperModule, InfoChess, BuildingBoardModule) {

  if (Array.prototype.forEach === undefined) {
    Array.prototype.forEach = function(callback) {
      for (var idx = 0; idx < this.length; ++idx) {
        callback(this[idx]);
      }
    };
  }

  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(searchElement /*, fromIndex */) {

      "use strict";

      if (this === void 0 || this === null)
        throw new TypeError();

      var t = Object(this);
      var len = t.length >>> 0;
      if (len === 0)
        return -1;

      var n = 0;
      if (arguments.length > 0)
      {
        n = Number(arguments[1]);
        if (n !== n)
          n = 0;
        else if (n !== 0 && n !== (1 / 0) && n !== -(1 / 0))
          n = (n > 0 || -1) * Math.floor(Math.abs(n));
      }

      if (n >= len)
        return -1;

      var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);

      for (; k < len; k++) {
        if (k in t && t[k] === searchElement)
          return k;
      }
      return -1;
    };
  }

  var BuildingBoard = BuildingBoardModule.BuildingBoard;
  var Piece = HelperModule.Piece;
  var Position = HelperModule.Position;
  var keyToPosition = HelperModule.keyToPosition;

  var TYPES = [
    'king',
    'queen',
    'rook',
    'knight',
    'bishop',
    'pawn'
  ];

  var metadata = InfoChess.metadata;

  var socket = io.connect(null, {
    'remember transport': false
  });

  var g_role = 'spectator';
  var g_gameState = null;
  var g_building_board = null;
  var g_last_phase = null;
  var g_selectedType; // Selected piece type when building army
  var g_playSounds = true;
  var g_soundsLoaded = false;
  var g_actions_enabled = {
    pawn_capture: false,
    psyop_normal: false,
    psyop_reinforced: false,
    ew_normal: false,
    ew_reinforced: false,
    feint: false,
    end_turn: false
  };

  var ui_pieces = {}; // "x,y" -> div

  function isBlackPlayer() {
    return g_role === metadata.roles[1].slug;
  }

  function isWhitePlayer() {
    return g_role === metadata.roles[0].slug;
  }

  function isSpectator() {
    return g_role === SPECTATOR_ROLE;
  }

  function getPlayerColour() {
    return g_role;
  }


  var SPECTATOR_ROLE = 'spectator';
  var WHITE_ROLE = 'white';
  var BLACK_ROLE = 'black';
  var SQUARE_SIZE = 70;
  var PIECE_MARGIN = 39;

  function getBuildingBoard() {
    if (!g_building_board) {
      g_building_board = new BuildingBoard();
    }
    return g_building_board;
  }

  function recalculateArmy() {
    // TODO if game has started, die/throw/or something
    var building_board = getBuildingBoard();
    var points = building_board.points();

    $("#points_remaining #points").text(building_board.max_points - points);
    TYPES.forEach(function(type) {
      $("#" + type + " .count").text(building_board.count(type));
    });
  }

  function addPiece(container, position, className, margin) {
    var newPieceOnBoard = document.createElement("div");
    newPieceOnBoard.className += " " + className;
    newPieceOnBoard.style.left = margin + ((position.x) * SQUARE_SIZE) + 'px';
    newPieceOnBoard.style.bottom = margin + ((position.y) * SQUARE_SIZE) + 'px';
    container.appendChild(newPieceOnBoard);
    return newPieceOnBoard;
  }

  function addNormalPiece(piece, position) {
    var container = document.getElementById('pieces');
    var cssclass = cssClassForPiece(piece) + " normal_piece";
    if (piece.invisible === true) {
      cssclass = cssclass + " invisible";
    }
    var newPieceOnBoard = addPiece(container, position, cssclass, PIECE_MARGIN);

    if (getPlayerColour() === piece.colour) {
      newPieceOnBoard.onclick = function() {
        if (g_gameState.getCurrentRole() === g_role) {
          clearSelection();
          this.className += " selected";
          displayPossibleMoves(getPlayerColour(), piece, position);
        }
      };
    }

    return newPieceOnBoard;
  }

  function addTempPiece(piece, position) {
    var container = document.getElementById('pieces');
    var cssclass = cssClassForPiece(piece) + " temp_piece";
    var newPieceOnBoard = addPiece(container, position, cssclass, PIECE_MARGIN);

    //Add removal marker
    var removalMarker = document.createElement("div");
    removalMarker.className = "removal_marker";
    removalMarker.onclick = function() {
      container.removeChild(newPieceOnBoard);
      getBuildingBoard().removePiece(position);
      displayValidStartingPositions(getPlayerColour(), g_selectedType);
      recalculateArmy();
    };
    newPieceOnBoard.appendChild(removalMarker);

    return newPieceOnBoard;
  }

  function clearSelection() {
    $(".selected").removeClass("selected");
  }

  function displayPossibleMoves(role, piece, position) {
    var $moves = $("#moves");
    // Clear all shadow pieces
    $moves.text("");

    var pos_keys = g_gameState.getPossibleMoves(piece, position);

    pos_keys.forEach(function(pos_key) {

      var handler = function(piece, src, dest) {
        return function() {
          clearSelection();
          var move = {
            src: src,
            dest: dest
          };
          socket.emit('move', move);
        };
      }(piece, position, keyToPosition(pos_key));

      createMove($moves, piece, keyToPosition(pos_key), handler);
    });
    $moves.css('visibility', 'visible');

    var castling = g_gameState.getCastlingMoves(piece, position);

    console.log("Castling results");
    console.log(castling);
    createCastlingMoves($moves, piece, position, castling);
  }

  function createCastlingMoves(container, piece, position, castling) {
    var castlingHandler = function(side, piece) {
      return function() {
        if (side !== 'queenside' && side !== 'kingside') {
          throw "Invalid side for castling: " + side;
        }
        clearSelection();
        var rook_x = side === 'queenside' ? 0 : 7;
        var move = {
          src: new Position(4, piece.starting_row),
          dest: new Position(rook_x, piece.starting_row)
        }
        socket.emit('move', move);
      };
    };
    var queensideHandler = castlingHandler('queenside', piece);
    var kingsideHandler = castlingHandler('kingside', piece);

    if ((castling.queenside || castling.kingside) && piece.type !== "king") {
      //highlight the king
      var king_pos = castling.queenside ? castling.queenside.king : castling.kingside.king;
      var king = new Piece('king', getPlayerColour());
      var handler = null;
      if (position.x === 0) {
        handler = queensideHandler;
      } else if (position.x === 7) {
        handler = kingsideHandler;
      } else {
        throw "Invalid position for castling: " + position.asKey();
      }
      createCastlingMove(container, king, new Position(4, king.starting_row), handler);
    }
    if (castling.queenside && piece.type !== "rook") {
      //highlight queenside rook
      var rook_pos = castling.queenside.rook;
      var rook = new Piece('rook', getPlayerColour());
      createCastlingMove(container, rook, new Position(0, rook.starting_row), queensideHandler);
    }
    if (castling.kingside && piece.type !== "rook") {
      //highlight kingside rook
      var rook_pos = castling.kingside.rook;
      var rook = new Piece('rook', getPlayerColour());
      createCastlingMove(container, rook, new Position(7, rook.starting_row), kingsideHandler);
    }
  }

  function displayValidStartingPositions(side, piece_type) {

    var $moves = $("#"+getPlayerColour()+"_moves");

    // Clear all shadow pieces
    $moves.text("");

    // Determine if placement of this piece would go over the army limit
    var building_board = getBuildingBoard();
    var piece = new Piece(piece_type, getPlayerColour());
    var positions = building_board.getPossiblePlacements(piece);
    if (positions.length === 0) {
      return;
    }

    for (i = 0; i < positions.length; i++) {
      var position = positions[i];

      var handler = function(position) {
        return function() {
          addTempPiece(piece, position);
          getBuildingBoard().addPiece(piece, position);
          recalculateArmy();
          displayValidStartingPositions(getPlayerColour(), g_selectedType);
        };
      }(position);

      createMove($moves, piece, position, handler);
    }
    $moves.css('visibility', 'visible');
  }

  function cssClassForPiece(piece) {
    return piece.type + '_' + piece.colour;
  }

  function createMove($moves, piece, position, clickHandler) {
    var container = $moves.get(0);
    var cssclass = "shadow_piece " + cssClassForPiece(piece);
    var newPieceOnBoard = addPiece(container, position, cssclass, PIECE_MARGIN);
    newPieceOnBoard.onclick = clickHandler;
  }

  // Add a div to the board at position with the given class. Also attach click handler
  function addToBoard(cssclass, position, clickHandler) {
    var container = $("#moves").get(0);
    var square = addPiece(container, position, cssclass, PIECE_MARGIN);
    square.onclick = clickHandler;
  }

  function createCastlingMove($moves, piece, position, clickHandler) {
    var container = $moves.get(0);
    var cssclass = "castling_shadow_piece";
    var newPieceOnBoard = addPiece(container, position, cssclass, PIECE_MARGIN);
    newPieceOnBoard.onclick = clickHandler;
  }

  function addPawnCaptureSource(position, clickHandler) {
    console.log("Adding pawn_capture_source for position" + position);
    addToBoard("pawn_capture_source", position, clickHandler);
  }

  function addPawnCaptureTarget(position, clickHandler) {
    console.log("Adding pawn_capture_target for position" + position);
    addToBoard("pawn_capture_target", position, clickHandler);
  }

  function setTransitionProperty($element, value) {
    $element.css('transition', value);
    $element.css('webkitTransition', value);
    $element.css('mozTransition', value);
    $element.css('oTransition', value);
  }

  function clearTransitionProperty($element) {
    $element.css('transition', '');
    $element.css('webkitTransition', '');
    $element.css('mozTransition', '');
    $element.css('oTransition', '');
  }

  function setOverlayText($overlay, text) {
    text = text || "";
    if ($overlay.text() == text) {
      return;
    }
    var oldBackground = $overlay[0].style.background;
    var timeout = 450;
    $overlay.text(text);
    setTransitionProperty($overlay, 'background ' + timeout + 'ms');
    $overlay.css('background', '#C90');
    setTimeout(function() {
      $overlay.css('background', oldBackground);
      setTimeout(function() {
        clearTransitionProperty;
      }, timeout);
    }, timeout);
  }

  function hideArmySelector() {
    var $builder = $('#army_selector').first();
    $builder.css('display', 'none');
  }

  function showPawnUpgradeDialog() {
    console.log("Showing pawn upgrade");
    var $dialog = $('#pawn_upgrade_dialog').first();
    $dialog.css('visibility', 'visible');
  }

  function updateArmySelector() {
    var $builder = $('#army_selector').first();
    if (g_gameState.getCurrentPhase() === g_gameState.PHASES.SETUP) {
      $builder.css('display', 'block');
    } else {
      $builder.css('display', 'none');
      $(".temp_piece").remove();
      $(".shadow_piece").remove();
    }
  }

  function serializeArmy() {
    return getBuildingBoard().serialize();
  }

  var CHOOSING = "choosing";
  var READY = "ready";
  function update_opponent_status(new_status) {
    console.log("UPDATING STATUS: " + new_status);
    var $status = $('#opponent_status').first();
    if (new_status == CHOOSING) {
      $status.text('Opponent is choosing their army.');
    } else if (new_status == READY) {
      $status.text('Opponent is ready.');
    } else {
      console.log("Invalid status: " + new_status);
    }
  }

  function updateBoard() {
    if (g_gameState.getCurrentPhase() === g_gameState.PHASES.SETUP) {
      // TODO refresh the placed pieces properly once building boards are persisted
      return;
    }
    var pieces = g_gameState.board.getPieces();
    console.log("Updating board, pieces:" );
    console.log(pieces);
    var piecesOnBoard = ui_pieces || {};
    $("#pieces").text("");
    $("#moves").text("");

    for (var pos_key in pieces) {
      if (pieces.hasOwnProperty(pos_key)) {
        var piece = pieces[pos_key];
        addNormalPiece(piece, keyToPosition(pos_key));
      }
    }
  }

  function updateActions() {
    var phase = g_gameState.getCurrentPhase();
    var phases = g_gameState.PHASES;

    g_actions_enabled.pawn_capture = false;
    g_actions_enabled.psyop_normal = false;
    g_actions_enabled.psyop_reinforced = false;
    g_actions_enabled.ew_normal = false;
    g_actions_enabled.ew_reinforced = false;
    g_actions_enabled.feint = false;
    g_actions_enabled.end_turn = false;

    if (phase === phases.SETUP ||
        phase === phases.PAWNUPGRADE ||
        phase === phases.DEFENSE ||
        phase === phases.GAMEOVER ||
        phase === phases.PAWNCAPTURE) {
      //disable all
    } else if (phase === phases.MOVE) {
      //enable only pawn capture
      g_actions_enabled.pawn_capture = true;
    } else if (phase === phases.IW) {
      //enable psyop, ew, end_turn, feint
      g_actions_enabled.psyop_normal = true;
      g_actions_enabled.psyop_reinforced = true;
      g_actions_enabled.ew_normal = true;
      g_actions_enabled.ew_reinforced = true;
      g_actions_enabled.feint = true;
      g_actions_enabled.end_turn = true;
    }
  }

  function updateIW() {
    $("#psyop_attack_cost").text(g_gameState.currentPsyOpAttackCost);
    $("#ew_attack_cost").text(g_gameState.currentEWAttackCost);
    $("#psyop_defend_cost").text(g_gameState.currentPsyOpDefendCost);
    $("#ew_defend_cost").text(g_gameState.currentEWDefendCost);
    $("#iw_points").text(g_gameState.remainingIW);
  }

  function clearPawnCaptureTargets() {
    $(".pawn_capture_target").remove();
  }

  function updatePawnCaptures(captures) {
    var me = this;
    console.log("Got captures!");
    console.log(captures);
    var sources = [];
    var targets = {};
    var i;
    for (i = 0; i < captures.length; i++) {
      var capture = captures[i];
      if (sources.indexOf(capture.src) === -1) {
        sources.push(capture.src);
      }
      targets[new Position(capture.dest.x, capture.dest.y).asKey()] = capture.dest;
    }

    console.log("SOURCES AND TARGETS");
    console.log(sources);
    console.log(targets);

    for (i = 0; i < sources.length; i++) {
      var sourceHandler = function(src) {
        return function() {
          console.log("Source pawn "+src.x+","+src.y+" clicked");
          var dir_mod = getPlayerColour() === "white" ? 1 : -1;
          var left  = new Position(src.x - 1, src.y + (1*dir_mod));
          var right = new Position(src.x + 1, src.y + (1*dir_mod));
          clearPawnCaptureTargets();

          var addTarget = function(position) {
            if (targets[position.asKey()]) {
              var handler = function() {
                console.log("Target pawn "+position.x+","+position.y+" clicked. Using src "+src.x+","+src.y);
                var move = {
                  src: src,
                  dest: position
                };
                socket.emit('move', move);
              };
              addPawnCaptureTarget(position, handler);
            }
          };

          addTarget(left);
          addTarget(right);
        };
      }(sources[i]);
      addPawnCaptureSource(new Position(sources[i].x, sources[i].y), sourceHandler);
    }
     // for (i = 0; i < targets.length; i++) {
     //   var destHandler = function() {
     //     console.log("target square clicked");
     //   };
     //   addPawnCaptureTarget(new Position(targets[i].x, targets[i].y), destHandler);
     // }
  }

  function playSound(id) {
    if (g_playSounds) {
      var sound = document.getElementById(id);
      if (sound.readyState === 4) { // HAVE_ENOUGH_DATA - aka it's loaded
        sound.play();
      }
    }
  }

  function notifyPlayer() {
    if ((isWhitePlayer() && g_gameState.isWhiteTurn()) ||
        (isBlackPlayer() && g_gameState.isBlackTurn())) {
      playSound('your_turn');
    }
  }

  function phaseHasChanged(old_phase, new_phase) {
    var phases = g_gameState.PHASES;
    if (old_phase === phases.IW || old_phase === phases.DEFENSE) {
      // it's now their turn
      notifyPlayer();
    }

    if (new_phase === phases.MOVE) {
      printMessage('server', "Current phase: "+g_gameState.getCurrentRole()+"'s physical move.");
    } else if (new_phase === phases.IW) {
      printMessage('server', "Current phase: "+g_gameState.getCurrentRole()+"'s information-warfare move.");
      printMessage('server', "Choose one of psyop, electronic warface, feint, or end turn.");
    } else if (new_phase === phases.DEFENSE) {
      printMessage('server', "Current phase: "+g_gameState.getCurrentRole()+" is defending against IW attack.");
    } else if (new_phase === phases.PAWNUPGRADE) {
      printMessage('server', "Current phase: "+g_gameState.getCurrentRole()+" is upgrading a pawn");
    }
  }

  function updatePlayerTurnOverlay() {
    var $overlay = $('#turn_overlay').first();
    var yourTurn = "YOUR TURN";
    var opponentsTurn = "OPPONENT'S TURN";
    if (g_gameState.getWinner()) {
      var winner = _.find(metadata.roles, function(role){ return role.slug === g_gameState.getWinner();});
      setOverlayText($overlay, winner.name.toUpperCase() + " WINS");
      return;
    }
    if (isSpectator()) {
      setOverlayText($overlay, g_gameState.getCurrentPhase() + "'S TURN");
      return;
    }
    if (g_gameState.getCurrentRole() === g_role) {
      setOverlayText($overlay, yourTurn);
    } else {
      setOverlayText($overlay, opponentsTurn);
    }
  }

  function printMessage(user, message) {
    var messageDiv = document.createElement('div');
    messageDiv.innerHTML = '<span style="padding-right: 15px; color: red;">' + user +
      '</span>' + message;
    document.getElementById('chatlog').appendChild(messageDiv);
    $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
  }

  function createArmySelector() {
    /*
          <li id="king"><img class="piece" src="images/king_white.100x100.png">King</li>
          <li id="queen"><img class="piece" src="images/queen_white.100x100.png">Queens: <span class="count">0</span> (cost: 3 points)</li>
          <li id="knight"><img class="piece" src="images/knight_white.100x100.png">Knights: <span class="count">0</span> (cost: 2 points)</li>
          <li id="rook"><img class="piece" src="images/rook_white.100x100.png">Rooks: <span class="count">0</span> (cost: 2 points)</li>
          <li id="bishop"><img class="piece" src="images/bishop_white.100x100.png">Bishops: <span class="count">0</span> (cost: 1 point)</li>
          <li id="pawn"><img class="piece" src="images/pawn_white.100x100.png">Pawns: <span class="count">0</span> (cost: 1 point)</li>
    */

    var pieces = ["king", "queen", "knight", "rook", "bishop", "pawn"];
    var costs  = [     0,       3,        2,      2,        1,      1];
    var container = document.getElementById('pieces_list');

    // TODO hook up some templating here
    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i];
      var cost = costs[i];

      var src = "images/"+piece+"_"+getPlayerColour()+".100x100.png";
      var li = document.createElement("li");
      li.id = piece;
      li.innerHTML = "<img class='piece' src='"+src+"'>"+piece+": <span class='count'>0</span> (cost: "+cost+" points)";
      container.appendChild(li);
    }

    $('#finish_army').bind('click', function() {
      socket.emit('select_army', serializeArmy());
    });
    $('#pieces_list > li').bind('click', function(event) {
      var $li = $(this);
      if ($li.hasClass('chosen')) {
        $li.removeClass('chosen');
      } else {
        $('#pieces_list > li').removeClass('chosen');
        $li.addClass('chosen');
      }
      g_selectedType = this.id;
      displayValidStartingPositions(getPlayerColour(), g_selectedType);
    });
  }

  function initPawnUpgradeDialog() {
    var pieces = ["queen", "knight", "rook", "bishop"];
    var container = document.getElementById('upgrade_list');

    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i];

      var src = "images/"+piece+"_"+getPlayerColour()+".100x100.png";
      var li = document.createElement("li");
      li.id = piece;
      li.innerHTML = "<img class='piece' src='"+src+"'>"+piece;
      li.onclick = function(type) {
        return function() {
          socket.emit('pawn_upgrade', type);
          $dialog = $("#pawn_upgrade_dialog").css('visibility', 'hidden');
        };
      }(piece);
      container.appendChild(li);
    }
  }

  $('#pawn_capture').bind('click', function() {
    if (g_actions_enabled.pawn_capture) {
      socket.emit('pawn_capture_query');
    }
  });
  $('#psyop_normal').bind('click', function() {
    if (g_actions_enabled.psyop_normal) {
      socket.emit('psyop', { reinforced: false });
    }
  });
  $('#psyop_reinforced').bind('click', function() {
    if (g_actions_enabled.psyop_reinforced) {
      socket.emit('psyop', { reinforced: true });
    }
  });
  $('#ew_normal').bind('click', function() {
    if (g_actions_enabled.ew_normal) {
      socket.emit('ew', { reinforced: false });
    }
  });
  $('#ew_reinforced').bind('click', function() {
    if (g_actions_enabled.ew_reinforced) {
      socket.emit('ew', { reinforced: true });
    }
  });
  $('#feint').bind('click', function() {
    if (g_actions_enabled.feint) {
      if (g_gameState.currentPsyOpAttackCost === 1 && g_gameState.currentEWAttackCost === 1) {
        alert("Feints can only be done when any of the current IW attack costs are 2.");
      } else {
        socket.emit('feint');
      }
    }
  });
  $('#end_turn').bind('click', function() {
    if (g_actions_enabled.end_turn) {
      socket.emit('end_turn');
    }
  });

  socket.on('connect', function() {

    // receive messages
    socket.on('message', function (data) {
      printMessage(data.user, data.message);
      window.scrollTo(0, document.body.scrollHeight);
    });
    socket.on('error', function(msg) {
      printMessage("server", "Error: " + msg);
      console.log("Server error: " + msg);
      window.scrollTo(0, document.body.scrollHeight);
    });
    socket.on('session_error', function(data) {
      console.log("Invalid session. Reloading.");
      location.reload();
    });
    socket.on('user_disconnect', function(data) {
      var userSpan = document.getElementById(data.user);
      if (socket.id != data.user && userSpan && userSpan.parentNode) {
        userSpan.parentNode.remove(userSpan);
      }
    });

    socket.on('opponent_ready', function() {
      update_opponent_status(READY);
    });

    socket.on('opponent_choosing', function() {
      update_opponent_status(CHOOSING);
    });

    socket.on('role', function(role) {
      g_role = role;
      if (role === WHITE_ROLE) {
        printMessage("server", "You are the White player!");
      } else if (role === BLACK_ROLE) {
        printMessage("server", "You are the Black player!");
      } else {
        printMessage("server", "You are a spectator");
        $('.board').addClass('guerrilla_board');
      }
      $('.board').addClass('flickering_board');
      createArmySelector();
      initPawnUpgradeDialog();
    });

    socket.on('num_connected_users', function(numConnectedUsers) {
      if (numConnectedUsers >= 1) {
        $('.board').first().show();
        $('#waiting').hide();
      } else {
        $('#waiting').show();
        $('.board').first().hide();
      }
    });

    socket.on('getVote', function(vote) {
      var choice = confirm(vote.question);
      socket.emit('vote', {name: vote.name, choice: choice ? 'yes' : 'no'});
    });

    socket.on('user_info', function(userInfo) {
      $('#username').val(userInfo.name);
    });

    socket.on('defend', function(data) {
      console.log("Defending! Cost: " + data.defense_cost);
      console.log(data);
      if (confirm("The opponent has issued an IW attack!. Do you wish to defend? It will cost "+data.defense_cost+" IW")) {
        alert("You have chosen to defend. Good for you!");
        socket.emit('iw_defense', { defend: true });
      } else {
        alert("You have chosen not to defend. Foop!");
        socket.emit('iw_defense', { defend: false });
      }
    });

    socket.on('update', function(updateResponse) {
      if (!updateResponse || !updateResponse.gameState) {
        return;
      }

      g_gameState = new InfoChess.InfoChess;
      g_gameState.fromDTO(updateResponse.gameState);

      console.log("REsponse:");
      console.log(updateResponse);

      if (g_last_phase !== g_gameState.getCurrentPhase()) {
        phaseHasChanged(g_last_phase, g_gameState.getCurrentPhase());
        g_last_phase = g_gameState.getCurrentPhase();
      }

      updateArmySelector();
      updatePlayerTurnOverlay();
      updateActions();
      updateBoard();
      updateIW();
      if (g_gameState.currentPhase === g_gameState.PHASES.PAWNUPGRADE &&
        g_gameState.currentRole == getPlayerColour()) {
        showPawnUpgradeDialog();
      }
      if (updateResponse.result.pawn_captures) {
        updatePawnCaptures(updateResponse.result.pawn_captures);
      }

      if (g_gameState.getWinner()) {
        $("#forfeit").addClass("disabled");
      }
    });

    // send message functionality
    var messageInput = document.getElementById('message');
    var usernameInput = document.getElementById('username');
    var sendMessage = function() {
      var message = messageInput.value;
      if (!message) {
        return;
      }
      var user = usernameInput.value || 'player';
      // TODO username should be determined on the server.
      socket.emit('message', { user: user, message: message });
      messageInput.value = '';
      messageInput.focus();
    };

    // send messages
    $(messageInput).bind('keypress', function(evt) {
      if (evt.keyCode == 13) { sendMessage(); }
    });
  });

  $(".toggle_sound").bind('click', function() {
    if (g_playSounds) {
      g_playSounds = false;
      $("#toggle_sound").text("Enable Sound");
      $("#volume_control").addClass("volume_control_off");
      $("#volume_control").removeClass("volume_control_on");
    } else {
      g_playSounds = true;
      $("#toggle_sound").text("Disable Sound");
      $("#volume_control").addClass("volume_control_on");
      $("#volume_control").removeClass("volume_control_off");
    }
  });

  $("#settings_dialog").dialog({
    autoOpen: false,
    dialogClass: "settings_dialog",
    draggable: false,
    resizable: false,
    width: 350,
    buttons: [ { text: "Close", click: function() { $( this ).dialog( "close" ); } } ]
  });
  $("#settings").bind('click', function() {
    if ($("#settings_dialog").dialog("isOpen")) {
      $("#settings_dialog").dialog("close");
    } else {
      $("#settings_dialog").dialog("open");
    }
  });

  function forfeit_game() {
    socket.emit('forfeit');
  }

  $("#forfeit_dialog").dialog({
    autoOpen: false,
    dialogClass: "settings_dialog",
    modal: true,
    width: 400,
    buttons: [
      { text: "Forfeit", click:
        function() {
          forfeit_game();
          $( this ).dialog("close");
        } },
      { text: "Close", click: function() { $( this ).dialog("close"); } }
    ]
  });
  $("#forfeit").bind('click', function() {
    if (!g_gameState.getWinner()) {
      $("#forfeit_dialog").dialog("open");
    }
  });

});
