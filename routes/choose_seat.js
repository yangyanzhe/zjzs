var express = require('express');
var router = express.Router();

var model = require('../models/models');
var urls = require("../address_configure");

var TICKET_DB = model.tickets;
var ACTIVITY_DB = model.activities;
var SEAT_DB = model.seats;
var db = model.db;

function checkValidity(req, res, callback)
{
    if (req.query.ticketid == null)
    {
        res.send("ticketid is required!");
        return;
    }
    db[TICKET_DB].find({unique_id: req.query.ticketid, status:{$ne:0}}, function(err, docs)
    {
        if (docs.length == 0)
        {
            res.send("No such a ticket.");
            return;
        }
        else
        {
            var activityid = docs[0].activity;
            if (docs[0].status!=1 && docs[0].status!=2)
            {
                res.send("Wrong status.");
                return;
            }
            if (docs[0].seat!="")
            {
                res.render("alert",
                {
                    errorinfo:  "已经选过座位啦！座位是"+docs[0].seat,
                    backadd:    urls.ticketInfo+"?ticketid="+req.query.ticketid
                });
                return;
            }

            db[ACTIVITY_DB].find({_id: activityid}, function(err, docs1)
            {
                if (docs1.length == 0)
                {
                    res.send("No activity found.");
                    return;
                }
                else
                {
                    if (docs1[0].need_seat!=2)
                    {
                        res.send("No need to choose seat.");
                        return;
                    }
                    var current=(new Date()).getTime();
                    if (current<docs1[0].book_start || current>docs1[0].book_end)
                    {
                        res.render("alert",
                        {
                            errorinfo: "抱歉，选座时间已过<br>请等待系统自动分配座位",
                            backadd:    urls.ticketInfo+"?ticketid="+req.query.ticketid
                        });
                        return;
                    }
                    callback(req.query.ticketid, activityid, docs1[0].book_end);
                }
            });
        }
    });
}

function addZero(num)
{
    if (num<10)
        return "0"+num;
    return ""+num;
}
function getTime(datet,isSecond)
{
    if (!(datet instanceof Date))
        datet=new Date(datet);
    datet.getMinutes()
    return datet.getFullYear() + "年"
        + (datet.getMonth()+1) + "月"
        + (datet.getDate()) + "日 "
        + addZero(datet.getHours()) + ":"
        + addZero(datet.getMinutes())
        + (isSecond===true? ":"+datet.getSeconds() : "");
}
router.get("/", function(req, res)
{
    checkValidity(req,res,function(ticketID, activityID, bookend)
    {
        db[SEAT_DB].find({activity:activityID},function(err, docs)
        {
            if (err || docs.length==0)
            {
                res.send("Error.");
                return;
            }
            var errorid=100;
            if (req.query.err!=null)
                errorid=1;
            var seatMap={},line,row;
            for (var i in docs[0])
            {
                if (i!="_id" && i!="activity" && i.length>=2)
                {
                    line=i[0]+"";
                    row=i.substr(1);
                    if (seatMap[line]==null)
                        seatMap[line]=[];
                    if (docs[0][i]>0)
                        seatMap[line].push(parseInt(row));
                }
            }
            var seatMap2=[];
            var alpha="ABCDEFGH";
            for (var i=0;i<8;i++)
            {
                if (seatMap[alpha[i]]==null)
                    seatMap2[i]=[];
                else
                    seatMap2[i]=seatMap[alpha[i]];
            }
            var inf=
            {
                tid:        ticketID,
                bookddl:    getTime(bookend),
                seatMap:    JSON.stringify(seatMap2),
                errorid:    errorid
            };

            res.render("seat_litang",inf);
        });
    });
});

router.post("/", function(req, res)
{
    checkValidity(req,res,function(ticketID, activityID, bookend)
    {
        var toFind={activity: activityID};
        var realName=req.body.seat;
        toFind[realName]={$gt:0};
        var toModify={};
        toModify[realName]=-1;
        console.log(realName);
        db[SEAT_DB].update(toFind,{$inc:toModify},{multi:false},function(err,result)
        {
            if (err || result.n==0)
            {
                //WARNING!
                res.redirect(urls.chooseseat+"?ticketid="+ticketID+"&err=1");
                return 0;
            }
            db[TICKET_DB].update({unique_id: req.query.ticketid, status:{$ne:0}},
            {
                $set:{seat:realName}
            },{multi:false},function(err,result)
            {
                if (err || result.n==0)
                {
                    //ROLL BACK, supposed never to be executed.
                    res.send("Fatal Failure!");
                    toModify[realName]=1;
                    db[SEAT_DB].update({activity: activityID},{$inc:toModify},{multi:false},function(){});
                    return;
                }
                res.redirect(urls.ticketInfo+"?ticketid="+ticketID);
            });
        });
    });
});

module.exports = router;
