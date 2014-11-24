var gravatar = require('node-gravatar'),
    User     = require('./models/user'),
    Game     = require('./models/game');

module.exports = function(io) {

  "use strict";

  io.sockets.on('connection', function(socket) {
    // Incoming WebSocket connection from a client
    // Note that `socket` inside this function refers to the open socket connection with a particular user

    var _game_id, _user_id; // global to this connection, will be set in 'join' below if this is a game page

    socket.on('chat message', function(data) {
      if(_game_id) {
        io.sockets.in(_game_id).emit('chat message', data);
      }
    });

    socket.on('join', function(data) {
      Game.findById(data.game_id,function(err,game) {
        if(game) {
          _game_id = data.game_id
          _user_id = data.user_id

          socket.join(_game_id);

          if(game.players.length >= game.maxPlayers) {
            socket.emit('join failed', 'Room is Full');
          } else {
            var newPlayer = {
              user_id    : _user_id,
              nickname   : data.nickname,
              avatar     : data.avatar,
              status     : 'joined',
              statusDate : Date.now(),
              score      : 0,
              isCardCzar : false
            };

            // use findByIdAndUpdate instead of game fields and game.save() in case of race conditions
            Game.findByIdAndUpdate(
              _game_id,
              {$push: {players: newPlayer}},
              {safe: true, upsert: false},
              function(err, game) {
                io.sockets.in(_game_id).emit('game state changed', game);
                io.sockets.in(_game_id).emit('player joined', {
                  user_id  : newPlayer.user_id,
                  nickname : newPlayer.nickname,
                  avatar   : newPlayer.avatar
                });
              }
            );
          }

        } else {
          socket.emit('join failed', 'No Such Room');
        }
      });
    }); // end 'join'

    socket.on('disconnect', function(data) {
      socket.leave(_game_id);

      // remove this player from the game in the database, and emit a state update!
      Game.findByIdAndUpdate(
        _game_id,
        {$pull: { "players": { user_id: _user_id } }},
        {safe: true, upsert: false},
        function(err, game) {
          io.sockets.in(_game_id).emit('game state changed', game);
          User.findById(_user_id, function(err, userObject) {
            if(userObject) io.sockets.in(_game_id).emit('player left', {
              user_id  : userObject._id,
              nickname : userObject.local.nickname,
              avatar   : gravatar.get(userObject.local.email)
            });
          });
        }
      );

    }); // end 'disconnect'

  });

}