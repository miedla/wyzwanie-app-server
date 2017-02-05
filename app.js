var http = require('http');
var express = require('express');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var mongoDb = require('mongodb');
var mongoClient = require('mongodb').MongoClient;
var objectId = require('mongodb').ObjectID;
// var mongoUrl = 'mongodb://localhost:27017/local';
var mongoUrl = 'mongodb://miedla:lukasz17@ds143449.mlab.com:43449/wyzwanie';
var bodyParser = require('body-parser');
var __dirname = 'public';

// var mongoUrl = 'mongodb://miedla:lukasz17@ds143449.mlab.com:43449/wyzwanie'//'mongodb://miedla:lukasz17@ds041154.mlab.com:41154/tzt-mongodb';

server.listen(8000);
console.log('socket listening on 8000');

//var usernames = [];//{};
var unamesTab = [];
var rooms = ['Lobby'];
// var roomsObj = [{name: 'Lobby', users: [], game: false}];
var roomsObj = [{name: 'Lobby', users: [], players: [], game: {active: false, usersQ: 0, isQuizStarted: false}}];
var defaultQuestionGet = 10;

io.sockets.on('connection', function(socket){
  console.log('connected socket: '+socket.id);

  socket.on('sendchat', function(data){
    emitMessageToRoomSockets(socket.room, socket.username, data, socket.id);
  });

  socket.on('gamestarted', function(data){
    // console.log("gamestarted, data: "+data);
    addPlayerToRoom(socket.id, socket.username, socket.room);
    updateGameStateToRoomSockets(socket.room, socket.id, true);
    emitInvitationToRoomSockets(socket.room, socket.username, socket.id, data);
  });

  socket.on('requiredplayersforquiz', function(){
    console.log('requiredplayersforquiz');
    emitQuizStarted(socket.room, socket.id);
    activateQuizForRoom(socket.room);
    updateGameStateToRoomSockets(socket.room, socket.id);
  });

  socket.on('gamefinished', function(data){
    for(i in roomsObj){
      if(roomsObj[i].name == socket.room){
        roomsObj[i].game.active = false;
        //roomsObj[i].game.usersQ = 1;
      }
    }
    deactivateQuizForRoom(socket.room);
    emitQuizFinished(socket.id, socket.room);
    removePlayerFromRoom(socket.id, socket.room, true);
    updateGameStateToRoomSockets(socket.room, socket.id, false);
  });

  socket.on("playerjoinedgame", function(){
    // console.log("playerjoinedgame, usernames: "+usernames);
    addPlayerToRoom(socket.id, socket.username, socket.room);
    updateGameStateToRoomSockets(socket.room, socket.id, true);
  });

  socket.on("playerexitedgame", function(){
    console.log("playerexitedgame, socket.room: "+socket.room);
    removePlayerFromRoom(socket.id, socket.room);
    emitPlayersScore(socket.room);
    updateGameStateToRoomSockets(socket.room, socket.id, false);
  });

  socket.on('adduser', function(username){
    console.log('username: '+username);
    if(unamesTab.indexOf(username) == -1){
      socket.username = username;
      unamesTab.push(username);
    }else{
      var counter = 1;
      for(i in unamesTab){
        if(unamesTab[i].indexOf(username) != -1){
          counter++;
        }
      }
      socket.username = username + counter;
      unamesTab.push(username);
    }
    socket.room = 'Lobby';
    console.log("socket id: "+socket.id);
    // usernames.push({name: username, isPlaying: false});
    socket.join('Lobby');
    addRoom(socket.room);
    addRoomUser(socket.room, socket.username);
    //updateUsernamesArray();
    console.log("unamesTab: "+unamesTab);
    socket.emit('updatechat', {from: 'SERVER', message: 'you have connected to Lobby'});
    //socket.broadcast.emit('updatechat', {from: 'SERVER', message: username + ' has connected'});
    socket.broadcast.to('Lobby').emit('updatechat', {from: 'SERVER', message: username + ' has connected'});
    io.sockets.emit('updaterooms', rooms, socket.room);
    emitUsersToRoomSockets(socket.room);
    // updateGameStateToRoomSockets(socket.room, socket.id);
  });

  socket.on('disconnect', function(){
    console.log("disconnect socketusername: "+socket.username);
    console.log("disconnect socketusername: "+socket.room);
    console.log("disconnect socketusername: "+socket.id);
    updateGameStateToRoomSockets(socket.room, socket.id, false);
    // delete usernames[socket.username];
    //updateUsernamesArray();
    unamesTab.splice(unamesTab.indexOf(socket.username), 1);
    //io.sockets.emit('updateusers', roomUsers);
    socket.broadcast.emit('updatechat', {from: 'SERVER', message: socket.username + ' has disconnected'});
    console.log("disconnect socketRoom: "+socket.room);
    socket.leave(socket.room);
    deleteRoomUser(socket.room, socket.username);
    if(getRoomUsers(socket.room).length < 1){
      deleteRoom(socket.room);
      io.sockets.emit('updaterooms', rooms, socket.room);
    }
    removePlayerFromRoom(socket.id, socket.room);
    // for(i in usernames){
    //   if(usernames[i].name == socket.username){
    //     usernames[i].isPlaying = false;
    //   }
    // }
    if(rooms.indexOf(socket.room) != -1){
      emitUsersToRoomSockets(socket.room);
    }
  });

  socket.on('create', function(room){
    rooms.push(room);
    roomsObj.push({name: room, users: [], players: [], game: {active: false, usersQ: 0, isQuizStarted: false}});
    console.log("create room");
    io.sockets.emit('updaterooms', rooms, socket.room);
  });

  socket.on('switchRoom', function(newroom){
    var oldroom;
    oldroom = socket.room;
    socket.leave(socket.room);
    socket.join(newroom);
    socket.emit('updatechat', { from: 'SERVER', message: 'you have connected to ' + newroom});
    socket.broadcast.to(oldroom).emit('updatechat', { from: 'SERVER', message: socket.username + ' has left room' });
    socket.room = newroom;
    socket.broadcast.to(newroom).emit('updatechat', { from: 'SERVER', message: socket.username + ' has joined this room' });
    deleteRoomUser(oldroom, socket.username);
    addRoomUser(newroom, socket.username);
    emitUsersToRoomSockets(newroom);
    if(getRoomUsers(oldroom).length > 0){
      emitUsersToRoomSockets(oldroom);
    }else{
      deleteRoom(oldroom);
      io.sockets.emit('updaterooms', rooms, socket.room);
    }
  });

  socket.on("updatescore", function(score){
    console.log("updatescore, score: "+score);
    setPlayerScore(socket.id, score, socket.room);
    emitPlayersScore(socket.room);
  });

});//connection end

function emitQuizFinished(hostId, room) {
  console.log('emitQuizFinished');
  for(i in roomsObj){
    if(roomsObj[i].name == room){
      roomsObj[i].game.active = true;
      for(p in roomsObj[i].players){
        if(hostId != p){
          var clientSocket = io.sockets.connected[p];
          clientSocket.emit('quizfinished');
        }
      }
      //removePlayerFromRoom(socket.id, socket.room, true);
      return;
    }
  }
}

function emitPlayersScore(roomName){
  var playerScoresArray = [];
  var playersSockets = [];
  for(i in roomsObj){
    if(roomsObj[i].name = roomName){
      for(pid in roomsObj[i].players){
        if(roomsObj[i].players[pid] != null){
          var client = io.sockets.connected[pid];
          console.log('emitPlayersScore, roomsObj[i].players[pid]: '+roomsObj[i].players[pid]);
          playersSockets.push(client);
          var playerObj = roomsObj[i].players[pid];
          playerScoresArray.push({name: playerObj.player_name, score: playerObj.player_score});
        }
      }
      break;
    }
  }

  for(c in playersSockets){
    console.log('emitPlayersScore, playersSockets[c]: '+playersSockets[c]);
    try{
      playersSockets[c].emit('playersscore', playerScoresArray);
    }catch(error){
      console.log('emitPlayersScore, error: '+error);
    }
  }
}

function setPlayerScore(playerId, score, room){
  for(i in roomsObj){
    if(roomsObj[i].name == room){
      roomsObj[i].game.active = true;
      for(pid in roomsObj[i].players){
        console.log('pid: '+pid);
        if(pid == playerId){
          var playerObj = roomsObj[i].players[playerId];
          playerObj.player_score = score;
          return;
        }
      }
    }
  }
}

function addPlayerToRoom(playerId, playerName, room){
  // console.log('addPlayerToRoom room: '+room);
  for(i in roomsObj){
    if(roomsObj[i].name == room){
      roomsObj[i].game.active = true;
      roomsObj[i].players[playerId] = {player_name: playerName, player_score: 0};//push(playerId);
      console.log('addPlayerToRoom: '+roomsObj[i].players[playerId]);
      return;
    }
  }
}

function removePlayerFromRoom(playerId, room, removeAll=false){
  console.log('removePlayerFromRoom room: '+room);
  roomsObj.indexOf()
  for(var i=0; i< roomsObj.length; i++){
    if(roomsObj[i].name == room){
      if(removeAll === false){
        roomsObj[i].players.splice(playerId, 1);//NIE USUWA!
        // roomsObj[i].players[playerId].player_name = "";
        // roomsObj[i].players[playerId].player_score = 0;
        console.log('player deleted!, p: '+playerId);
        console.log('roomsObj[i].players[playerId]: '+roomsObj[i].players[playerId].player_score);
        return;
      }
    }
    else{
      console.log('removeAll players from room!');
      roomsObj[i].game.active = false;
      roomsObj[i].players.splice(0, roomsObj[i].players.length);
      return;
    }
  }
}

function getRoomUsers(roomName){
  var roomUsers = [];
  for(i in roomsObj){
    if(roomsObj[i].name == roomName){
      roomUsers = roomsObj[i].users;
    }
  }
  return roomUsers;
}

function addRoom(roomName){
  if(roomsObj.length < 1){
    console.log("addRoom() roomsObj.length < 1");
    rooms.push(roomName);
    // roomsObj.push({name: roomName, users: [], game: false});
    roomsObj.push({name: roomName, users: [], players: [], game: {active: false, usersQ: 0, isQuizStarted: false}});
  }else{
    for(i in roomsObj){
      if(roomsObj[i].name == roomName){
        console.log("addRoom, roomsObj[i].name == roomName: "+roomsObj[i]);
        return;
      }
      rooms.push(roomName);
      // roomsObj.push({name: roomName, users: [], game: false});
      roomsObj.push({name: roomName, users: [], players: [], game: {active: false, usersQ: 0, isQuizStarted: false}});
      console.log("addRoom, roomsObj: "+roomsObj);
    }
  }
}

function deleteRoom(roomName){
  for(i in roomsObj){
    if(roomsObj[i].name == roomName){
      roomsObj.splice(i, 1);
    }
  }
  var idx = rooms.indexOf(roomName);
  rooms.splice(idx, 1);
}

function addRoomUser(roomName, username){
  console.log("addRoomUser, roomName: "+roomName+", username: "+username);
  for(i in roomsObj){
    if(roomsObj[i].name == roomName){
      roomsObj[i].users.push(username);
      console.log('roomObj ' + roomName + ' :' +roomsObj[i].users);
    }
  }
}

function deleteRoomUser(roomName, username){
  for(i in roomsObj){
    if(roomsObj[i].name == roomName){
      var idx = roomsObj[i].users.indexOf(username);
      roomsObj[i].users.splice(idx, 1);
      console.log('roomObj ' + roomName + ' :' +roomsObj[i].users);
    }
  }
}

function emitMessageToRoomSockets(roomName, username, msg, socketId){
  var clients = io.sockets.adapter.rooms[roomName].sockets;
  for(clientId in clients){
    if(clientId != socketId){
      var clientSocket = io.sockets.connected[clientId];
      clientSocket.emit('updatechat', {from: username, message: msg});
    }
  }
}

function emitInvitationToRoomSockets(roomName, username, socketId, data){
  console.log('emit invitation');
  var clients = io.sockets.adapter.rooms[roomName].sockets;
  for(clientId in clients){
    var clientSocket = io.sockets.connected[clientId];
    if(clientId != socketId){
      //var clientSocket = io.sockets.connected[clientId];
      clientSocket.emit('gameinvite', {from: username, questions: data});
    }
    //updateGameStateToRoomSockets(roomName, socketId, true);
  }
}

function emitQuizStarted(roomName, hostId){
  for(i in roomsObj){
    if(roomsObj[i].name = roomName){
      console.log('emitQuizStarted, room '+roomsObj[i]);
      for(pid in roomsObj[i].players){
        console.log('pid: '+pid);
        if(pid != hostId){
          var client = io.sockets.connected[pid];
          console.log('emitQuizStarted client: '+client + ' pid:' + pid);
          client.emit('quizstarted');
        }
      }
      emitPlayersScore(roomName);
    }
  }
}

function activateQuizForRoom(roomName){
  for(i in roomsObj){
    if(roomsObj[i].name == roomName){
      roomsObj[i].game.isQuizStarted = true;
    }
  }
}

function deactivateQuizForRoom(roomName){
  for(i in roomsObj){
    if(roomsObj[i].name == roomName){
      roomsObj[i].game.isQuizStarted = false;
    }
  }
}

function updateGameStateToRoomSockets(roomName, socketId, type){
  console.log('updateGameStateToRoomSockets: '+roomName);
  var gameRoom;
  for(i in roomsObj){
    if(roomsObj[i].name == roomName){
      if(type != undefined){
        if(roomsObj[i].game.usersQ < 1){
          if(!type){
            roomsObj[i].game.active = false;
            roomsObj[i].game.usersQ = 0;
          }else{
            //roomsObj[i].game.active = false;
            roomsObj[i].game.usersQ += 1;
          }
        }else{
          if(type){
            roomsObj[i].game.active = true;
            roomsObj[i].game.usersQ += 1;
          }else{
            roomsObj[i].game.active = true;
            roomsObj[i].game.usersQ -= 1;
          }
        }
      }
      if(roomsObj[i].game.usersQ < 1){
        removePlayerFromRoom(null, roomName, true);
        roomsObj[i].game.active = false;
        roomsObj[i].game.usersQ = 0;
        roomsObj[i].game.isQuizStarted = false;
      }

      console.log('roomsObj[i].game.usersQ: '+roomsObj[i].game.usersQ);
      gameRoom = roomsObj[i].game;

      break;
    }
  }

  try{
    var clients = io.sockets.adapter.rooms[roomName].sockets;
    for(clientId in clients){
      //if(clientId != socketId){
      var clientSocket = io.sockets.connected[clientId];
      clientSocket.emit('updategame', gameRoom);
      //}
    }
  }catch(err){
    console.log('updateGameStateToRoomSockets, err'+err);
  }
};

function emitUsersToRoomSockets(roomName){
  console.log('roomName: '+roomName);
  var clients = io.sockets.adapter.rooms[roomName].sockets;
  var numClients = (typeof clients !== 'undefined') ? Object.keys(clients).length : 0;

  for(clientId in clients){
    var clientSocket = io.sockets.connected[clientId];
    var roomUsers;
    for(i in roomsObj){
      if(roomsObj[i].name == roomName){
        roomUsers = roomsObj[i].users;
      }
    }
    console.log("roomUsers: "+roomUsers);
    clientSocket.emit('updateusers', roomUsers);
  }
}
///////////////////////////////////mongo/////////////////////////////
app.use(bodyParser());
app.set('view engine', 'pug');

app.listen(5000, function(){
  console.log('Listening on port 5000')
});

app.get('/', function(req, res){
  //res.sendfile(__dirname + '/hello.html');
  res.render('index', {
    title: "Questions dashobard",
    header: "Welcome to Wyzwanie dashboard!",
    paragraph: "pierwszy paragraph",
    route: "/getQuestions",
    link_txt: "get questions"
  });
});

app.get('/getQuestions', function(req, res){
  //res.setHeader('Content-Type', 'application/json');
  connectMongo(mongoUrl, function(db){
    getQuestions(db, function(questionArray){
      // console.log(questionArray);
      res.render('questions', {
        questions: questionArray,
        title: "Questions",
        header: "Get Questions",
        route: "/",
        link_txt: "home"
      });
    });
  });
});

app.get('/getQuestions.json', function(req, res){
  res.setHeader('Content-Type', 'application/json');
  connectMongo(mongoUrl, function(db){
    getQuestions(db, function(questionArray){
      // console.log(questionArray);
      if(defaultQuestionGet <= questionArray.length){
        var qarr = getRandomArrayElements(questionArray, defaultQuestionGet);
        res.json(qarr);
      }else{
        var qarr = getRandomArrayElements(questionArray, questionArray.length);
        res.json(qarr);
      }
      //res.json(questionArray);
    });
  });
});

function getRandomArrayElements(arr, n){
  var result = new Array(n);
  var length = arr.length;
  var taken = new Array(length);

  while (n--) {
    var x = Math.floor(Math.random() * length);
    result[n] = arr[x in taken ? taken[x] : x];
    taken[x] = --length;
  }
  return result;
}

app.get('/getQuestionForm', function(req, res){
  var questionId = req.query.id;
  console.log('question: '+questionId);
  if(questionId !== undefined){
    connectMongo(mongoUrl, function(db){
      getQuestion(db, questionId, function(question){
        if(question.answers != undefined){
          res.render('questionForm', {
            questionId: question._id,
            questionVal: question.question,
            answerAVal: question.answers[0].a,
            answerBVal: question.answers[1].b,
            answerCVal: question.answers[2].c,
            answerDVal: question.answers[3].d,
            correctVal: question.correct
          });
          db.close();
        }else{
          getQuestions(db, function(questionArray){
            res.render('questionForm', {
              questionId: question._id,
              questionVal: question.question
            });
          });
        }
      }, false);
    });
  }else{
    res.render('questionForm');
  }
});

app.post('/postQuestion', function(req, res){
  console.log(req.body);
  var questionId = req.body.id;
  var questionTxt = req.body.question;
  var correctAns = req.body.correct;
  var answersTab = [
    {"a": req.body.answerA},
    {"b": req.body.answerB},
    {"c": req.body.answerC},
    {"d": req.body.answerD}
  ];

  var document = {
    question: questionTxt,
    correct: correctAns.toLowerCase(),
    answers: answersTab
  };

  if(questionTxt == undefined || correctAns == undefined || answersTab == undefined){
    console.log('err1');
    res.render('questionForm', {
      errorMsg: "Prosze poprawnie wypelnic wszystkie pola!"
    });
    return;
  }else if(req.body.answerA == undefined || req.body.answerB == undefined || req.body.answerC == undefined || req.body.answerD == undefined){
    console.log('err2');
    res.render('questionForm', {
      errorMsg: "Prosze wypelnic wszystkie odpowiedz!"
    });
    return;
  }else if(document.correct == undefined || document.correct.length !== 1 || !document.correct.match(/[a-d]/i)){
    console.log('err3, '+document.correct);
    res.render('questionForm', {
      errorMsg: "Prosze wpisac poprawna odpowiedz [a,b,c,d]!"
    });
    return;
  }

  connectMongo(mongoUrl, function(db){
    var collection = db.collection('qa');
    if(questionId == ''){
      console.log("questionId == ''");
      collection.insert(document, function(err, inf){
        if(err){
          console.log("Error while inserting question to database");
        }else{
          res.redirect('getQuestions');
        }
      });
    }else{
      console.log(document);
      collection.update({_id: new mongoDb.ObjectID(questionId)}, document, function(err, inf){
        if(err){
          console.log("Error while updating question to database");
        }else{
          res.redirect('getQuestions');
        }
      });
    }
  });

});

app.get('/deleteQuestion', function(req, res){
  var id = req.query.id;
  console.log('id: '+id);
  connectMongo(mongoUrl, function(db){
    var collection = db.collection('qa');
    collection.deleteOne({_id: new mongoDb.ObjectID(id)}, function(err, inf){
      if(err){
        console.log('error while deleting question from db: '+err);
      }else{
        console.log('delete completed');
        res.redirect('getQuestions');
      }
    });
  });
});

function connectMongo(mongoUrl, callback){
  mongoClient.connect(mongoUrl, function(err, db){
    if(err){
      console.log('error while connecting to db: '+err);
    }else{
      callback(db);
    }
  });
}

function getQuestions(db, callback){
  var collection = db.collection('qa');
  collection.find({}).toArray(function(err, questions){
    if(err){
      console.log('error while get questions: '+err);
    }else{
      db.close();
      callback(questions);
    }
  });
}

function getQuestion(db, id, callback, close=true){
  var collection = db.collection('qa');
  collection.findOne({_id: new mongoDb.ObjectID(id)}, function(err, question){
    if(err){
      console.log('error while get question: '+err);
    }else {
      if(close){
        db.close();
      }
      console.log(question);
      callback(question);
    }
  });
}
