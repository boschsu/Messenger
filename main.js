process.title='Messenger'

var url_db='mongodb://127.0.0.1:27017/messenger';
var websocketPort=3001
var websocketServer=require('websocket').server

function htmlEntities(str) {
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var colors = [ 'red', 'green', 'blue', 'magenta', 'purple', 'plum', 'orange' ];
colors.sort(function(a,b) { return Math.random() > 0.5; } );


var MongoClient=require('mongodb').MongoClient;
var connect = require('connect');
var http=require('http');
var fs=require('fs');
var path=require('path');
var url=require('url');
var requestIp=require('request-ip')
var querystring=require('querystring')
var app=connect();

app.use(requestIp.mw({ attributeName : 'myCustomAttributeName' }))

var server=http.createServer(
	
	app.use(

		function(request,response){

			var ip = request.myCustomAttributeName;

			if (url.parse(request.url).pathname=='/postlogin'){
				var _data='';
				request.on('data',function(data){
					_data+=data;
				})
				request.on('end',function(){
					response.writeHead(200, {'Content-Type': 'application/json'});					
					// var data={
					// 	name:'高级'
					// }
					// response.end( JSON.stringify(_data) );
					// var result=decodeURIComponent(_data)
					var _result=querystring.parse(_data)
					var result=JSON.stringify(_result)					
					response.end(result)
					insertOneToDB(_result)
				})
			}else {

				var fileName=path.basename(request.url) || 'index.html';
				var fullPath=__dirname+'/src/'+fileName;
				console.log('Request for '+fullPath+' received. Client ip is '+ip);

				fs.readFile(fullPath,function(error,fileBinary){
					if (error){
						console.log(error);
						response.writeHead(200,{
							'Content-Type':'text/html'
						});
						response.write('no such file');
					}else {
						response.writeHead(200,{
							'Content-Type':'text/html'
						});
						response.write(fileBinary.toString());
					}
					response.end();
				});

			}
		}
	)
)

server.listen(websocketPort,function(){
	//console.log( (new Date())+" Server is listening on port "+websocketPort )
})

var ws=new websocketServer({
	httpServer:server
})
var history=[];
var clients=[]

ws.on('request',function(request){
	console.log((new Date())+" Connection from origin "+request.origin+'.');

	var connection=request.accept(null,request.origin)

	var index=clients.push(connection)-1
	var userName=false;
	var userColor=false;

	//console.log((new Date()) + ' Connection accepted.');

	exportDialogueFromDB(function(result){
		if (result.length>0) {
			connection.sendUTF(JSON.stringify({
				type:'history',
				data:result
			}))
		}
	})			

	connection.on('message',function(message){
		if (message.type==='utf8') {
			if (userName===false) {
				userName=htmlEntities(message.utf8Data);
				userColor=colors.shift()
				connection.sendUTF(JSON.stringify({
					type:'color',
					data:userColor
				}))
				console.log((new Date()) + ' User is known as: ' + userName + ' with ' + userColor + ' color.');
			}else {
				console.log((new Date()) + ' Received Message from ' + userName + ': ' + message.utf8Data);
				var obj={
					time:(new Date()).getTime(),
					text:htmlEntities(message.utf8Data),
					author:userName,
					color:userColor
				}
				insertDialogueToDB(obj);
				history=history.slice(-100)

				var json=JSON.stringify({
					type:'message', 
					data: obj 
				});
				for (var i=0;i<clients.length;i++){
					clients[i].sendUTF(json)//boradcast message to all connections
				}
			}
		}
	})

	connection.on('close', function(connection) {
		if (userName !== false && userColor !== false) {
			console.log((new Date()) + " Peer "
				+ connection.remoteAddress + " disconnected.");
			// remove user from the list of connected clients
			clients.splice(index, 1);
			// push back user's color to be reused by another user
			colors.push(userColor);
		}
	});
})

function insertOneToDB(entry){
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
		if (error) {
			throw('step1:'+error)
		}
		var messengerDB=mongo.db('messenger')
		var entryExist=false;

		messengerDB.collection('conversations').find(entry,function(error,result){
			if(error) {
				throw('step2:'+error)
			}
			if (Object.is(JSON.stringify(result.cmd.query),JSON.stringify(entry))) {
				entryExist=true;
				mongo.close();
				console.log('duplicate found, db closed.')
			}			
		})
		if (entryExist==false) {
			messengerDB.collection('conversations').insertOne(entry,function(error,result){
				if(error) {
					throw('step3:'+error)
				}
				console.log('Inserted one entry.')
				mongo.close();
			})	
		}else {
			mongo.close();
		}
	})
}

function insertDialogueToDB(entry){
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')	
		
		messengerDB.collection('dialogues').insertOne(entry,function(error,result){
			if(error) {
				throw(error)
			}
			console.log('Inserted one dialogue.')
			mongo.close();
		})			
	})
}

function exportDialogueFromDB(next){
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')
		
		messengerDB.collection('dialogues').find({}).toArray(function(error,result){
			if(error) {
				throw(error)
			}			
			mongo.close();
			next(result)
		})
	})
}