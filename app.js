var http = require('http');
var express = require('express');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var mongoDb = require('mongodb');
var mongoClient = require('mongodb').MongoClient;
var objectId = require('mongodb').ObjectID;
var mongoUrl = 'mongodb://localhost:27017/local';
var bodyParser = require('body-parser');
var __dirname = 'public';

server.listen(8000);
console.log('socket listening on 8000');

var usernames = [];//{};
var unamesTab = [];
var rooms = ['Lobby'];
// var roomsObj = [{name: 'Lobby', users: [], game: false}];
var roomsObj = [{name: 'Lobby', users: [], game: {active: false, usersQ: 0}}];

io.sockets.on('connection', function(socket){
  console.log('connected socket: '+socket.id);

  socket.on('sendchat', function(data){
    emitMessageToRoomSockets(socket.room, socket.username, data, socket.id);
  });

  socket.on('gamestarted', function(data){
    console.log("gamestarted, data: "+data);
    for(i in usernames){
      if(usernames[i].name == socket.username){
        usernames[i].isPlaying = true;
      }
    }
    for(i in roomsObj){
      if(roomsObj[i].name == socket.room){
        roomsObj[i].game.active = true;
        //roomsObj[i].game.usersQ = 1;
      }
    }

    emitInvitationToRoomSockets(socket.room, socket.username, socket.id, data);
  });

  socket.on('gamefinished', function(data){
    for(i in usernames){
      if(usernames[i].name == socket.username){
        usernames[i].isPlaying = false;
      }
    }
    for(i in roomsObj){
      if(roomsObj[i].name == socket.room){
        roomsObj[i].game.active = false;
        //roomsObj[i].game.usersQ = 1;
      }
    }

    updateGameStateToRoomSockets(socket.room, socket.id, false);
  });

  socket.on("playerjoinedgame", function(){
    console.log("playerjoinedgame, usernames: "+usernames);
    //usernames.
    //usernames[socket.name].isPlaying = true;
    //usernames.push({name: username, isPlaying: false});

    for(i in usernames){
      if(usernames[i].name == socket.username){
        usernames[i].isPlaying = true;
      }
    }

    updateGameStateToRoomSockets(socket.room, socket.id, true);
  });

  socket.on("playerexitedgame", function(){
    console.log("playerexitedgame, socket.room: "+socket.room);
    for(i in usernames){
      if(usernames[i].name == socket.username){
        usernames[i].isPlaying = false;
      }
    }
    updateGameStateToRoomSockets(socket.room, socket.id, false);
  });

  socket.on('adduser', function(username){
    console.log('username: '+username);
    socket.username = username;
    socket.room = 'Lobby';
    console.log("socket id: "+socket.id);
    usernames.push({name: username, isPlaying: false});
    socket.join('Lobby');
    addRoom(socket.room);
    addRoomUser(socket.room, socket.username);
    updateUsernamesArray();
    console.log("unamesTab: "+unamesTab);
    socket.emit('updatechat', {from: 'SERVER', message: 'you have connected to Lobby'});
    //socket.broadcast.emit('updatechat', {from: 'SERVER', message: username + ' has connected'});
    socket.broadcast.to('Lobby').emit('updatechat', {from: 'SERVER', message: username + ' has connected'});
    io.sockets.emit('updaterooms', rooms, socket.room);
    //io.sockets.emit('updateusers', unamesTab);
    emitUsersToRoomSockets(socket.room);

    // updateGameStateToRoomSockets(socket.room, socket.id);
  });

  socket.on('disconnect', function(){
    console.log("disconnect socketusername: "+socket.username);
    updateGameStateToRoomSockets(socket.room, socket.id, false);
    delete usernames[socket.username];
    updateUsernamesArray();
    io.sockets.emit('updateusers', unamesTab);
    socket.broadcast.emit('updatechat', {from: 'SERVER', message: socket.username + ' has disconnected'});
    console.log("disconnect socketRoom: "+socket.room);
    socket.leave(socket.room);
    deleteRoomUser(socket.room, socket.username);
    if(getRoomUsers(socket.room).length < 1){
      deleteRoom(socket.room);
      io.sockets.emit('updaterooms', rooms, socket.room);
    }

    for(i in usernames){
      if(usernames[i].name == socket.username){
        usernames[i].isPlaying = false;
      }
    }
    // socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
  });

  socket.on('create', function(room){
    rooms.push(room);
    // roomsObj.push({name: room, users: [], game: false});
    roomsObj.push({name: room, users: [], game: {active: false, usersQ: 0}});
    console.log("create room");
    io.sockets.emit('updaterooms', rooms, socket.room);
  });

  socket.on('switchRoom', function(newroom){
    var oldroom;
    oldroom = socket.room;
    socket.leave(socket.room);
    socket.join(newroom);
    socket.emit('updatechat', { from: 'SERVER', message: 'you have connected to ' + newroom});
    socket.broadcast.to(oldroom).emit('updatechat', { from: 'SERVER', message: socket.username + 'has left room' });
    socket.room = newroom;
    socket.broadcast.to(newroom).emit('updatechat', { from: 'SERVER', message: socket.username + 'has joined this room' });
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

});

function updateUsernamesArray(){
  unamesTab = [];
  for(i in usernames){
    unamesTab.push(usernames[i]);
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
    roomsObj.push({name: roomName, users: [], game: {active: false, usersQ: 0}});
  }else{
    for(i in roomsObj){
      if(roomsObj[i].name == roomName){
        console.log("addRoom, roomsObj[i].name == roomName: "+roomsObj[i]);
        return;
      }
      rooms.push(roomName);
      // roomsObj.push({name: roomName, users: [], game: false});
      roomsObj.push({name: roomName, users: [], game: {active: false, usersQ: 0}});
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

// function checkRoomExists(roomName){
//   for(i in roomsObj){
//     if(roomsObj[i].name == roomName && rooms.indexOf(roomName) != -1){
//       return true;
//     }
//   }
//   return false;
// }

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
  var clients = io.sockets.adapter.rooms[roomName].sockets;
  for(clientId in clients){
    var clientSocket = io.sockets.connected[clientId];
    if(clientId != socketId){
      //var clientSocket = io.sockets.connected[clientId];
      clientSocket.emit('gameinvite', {from: username, questions: data});
    }
    updateGameStateToRoomSockets(roomName, socketId, true);
  }
}

function updateGameStateToRoomSockets(roomName, socketId, type){
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
        roomsObj[i].game.active = false;
        roomsObj[i].game.usersQ = 0;
      }

      gameRoom = roomsObj[i].game;
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
      res.json(questionArray);
    });
  });
});

app.get('/getQuestionForm', function(req, res){
  var questionId = req.query.id;
  console.log('question: '+questionId);
  if(questionId !== undefined){
    connectMongo(mongoUrl, function(db){
      getQuestion(db, questionId, function(question){
        // console.log(question);
        //console.log('getQuestionCallback, question._id: '+question._id);
        res.render('questionForm', {
          questionId: question._id,
          questionVal: question.question,
          answerAVal: question.answers[0].a,
          answerBVal: question.answers[1].b,
          answerCVal: question.answers[2].c,
          answerDVal: question.answers[3].d,
          correctVal: question.correct
        });
      });
    });
  }else{
    res.render('questionForm');
  }
});

app.post('/postQuestion', function(req, res){
  console.log(req.body);
  var questionId = req.body.id;
  //console.log('questionId: '+questionId);
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

function getQuestion(db, id, callback){
  var collection = db.collection('qa');
  collection.findOne({_id: new mongoDb.ObjectID(id)}, function(err, question){
    if(err){
      console.log('error while get question: '+err);
    }else {
      db.close();
      console.log(question);
      callback(question);
    }
  });
}
