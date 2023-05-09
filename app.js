const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDBandServer();
console.log("HelloWorld!");
const authenticate = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "mySecretKey", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.user_id = payload.user_id;
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// app.get("/users/", async (request, response) => {
//   const getUsersQuery = `SELECT * FROM user;`;
//   const usersArray = await db.all(getUsersQuery);
//   response.send(usersArray);
// });

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  if (dbUser === undefined) {
    const hashedPassword = await bcrypt.hash(password, 10);
    if (password.length >= 6) {
      const createUserQuery = `
        INSERT INTO
            user(username, password, name, gender)
        VALUES
            ('${username}', '${hashedPassword}', '${name}', '${gender}');`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  if (dbUser !== undefined) {
    const isPasswordTrue = await bcrypt.compare(password, dbUser.password);
    if (isPasswordTrue) {
      const payload = { user_id: dbUser.user_id, username: username };
      const jwtToken = jwt.sign(payload, "mySecretKey");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

// {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyLCJ1c2VybmFtZSI6IkpvZUJpZGVuIiwiaWF0IjoxNjU5NDUyMjIzfQ.LnrARdHjqU84YhGWUHqfDGTC3Dma-gJIlw24mcZgVlM"}

const following = async (request, response, next) => {
  const { user_id } = request;
  const userFollowingQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${user_id};`;
  const userFollowingList = await db.all(userFollowingQuery);
  request.followingList = userFollowingList;
  next();
};

app.get("/user/tweets/feed/", authenticate, following, async (req, res) => {
  const { followingList } = req;
  const followingIds = followingList.map((each) => {
    return each.following_user_id;
  });

  const getUserFollowingTweets = `
    SELECT 
        username, tweet, date_time AS dateTime
    FROM
        user JOIN tweet ON user.user_id = tweet.user_id
    WHERE user.user_id IN (${followingIds})
    ORDER BY date_time DESC
    LIMIT 4;`;
  const result = await db.all(getUserFollowingTweets);
  res.send(result);
});

app.get("/user/following/", authenticate, following, async (req, res) => {
  const { followingList } = req;
  const followingIds = followingList.map((each) => {
    return each.following_user_id;
  });
  const userFollowingNames = `SELECT name FROM user WHERE user_id IN (${followingIds});`;
  const followingNames = await db.all(userFollowingNames);
  res.send(followingNames);
});

app.get("/user/followers/", authenticate, async (req, res) => {
  const { user_id } = req;
  const userFollowersQuery = `SELECT follower_user_id FROM follower WHERE following_user_id = ${user_id};`;
  const userFollowersList = await db.all(userFollowersQuery);

  const followerIds = userFollowersList.map((each) => {
    return each.follower_user_id;
  });
  const userFollowerNames = `SELECT name FROM user WHERE user_id IN (${followerIds});`;
  const followerNames = await db.all(userFollowerNames);
  res.send(followerNames);
});

const getTweetId = async (request, response, next) => {
  const { followingList } = request;
  const followingIds = followingList.map((each) => {
    return each.following_user_id;
  });

  const userFollowingTweets = `SELECT tweet_id FROM tweet WHERE user_id IN (${followingIds});`;
  const followingTweets = await db.all(userFollowingTweets);
  request.followingTweets = followingTweets;
  next();
};

app.get(
  "/tweets/:tweetId/",
  authenticate,
  following,
  getTweetId,
  async (request, response) => {
    const { tweetId } = request.params;
    const { followingTweets } = request;

    const followingAll = followingTweets.map((each) => {
      return each.tweet_id;
    });

    if (followingAll.includes(parseInt(tweetId))) {
      const userFollowingTweetDetails = `
        SELECT
            tweet.tweet, COUNT(DISTINCT like.like_id) AS likes,
            COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
        FROM
            tweet JOIN like ON tweet.tweet_id = like.tweet_id
            JOIN reply ON tweet.tweet_id = reply.tweet_id
        WHERE
            tweet.tweet_id = ${tweetId};`;
      const followingTweetDetails = await db.get(userFollowingTweetDetails);
      response.send(followingTweetDetails);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

const getUserLikeNames = (names) => {
  let namesArray = [];
  names.map((each) => {
    namesArray.push(each.username);
  });
  return { likes: namesArray };
};

const getReplyDetails = (replies) => {
  let repliesArray = [];
  replies.map((each) => {
    repliesArray.push(each);
  });
  return { replies: repliesArray };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticate,
  following,
  getTweetId,
  async (request, response) => {
    const { tweetId } = request.params;
    const { followingTweets } = request;

    const followingAll = followingTweets.map((each) => {
      return each.tweet_id;
    });

    if (followingAll.includes(parseInt(tweetId))) {
      const whoLikedTweet = `
        SELECT
            username
        FROM
            user JOIN like ON like.user_id = user.user_id
        WHERE 
            like.tweet_id IN (${tweetId});`;
      const names = await db.all(whoLikedTweet);
      response.send(getUserLikeNames(names));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  following,
  getTweetId,
  async (request, response) => {
    const { tweetId } = request.params;
    const { followingTweets } = request;

    const followingAll = followingTweets.map((each) => {
      return each.tweet_id;
    });
    if (followingAll.includes(parseInt(tweetId))) {
      const followingReplies = `
        SELECT
            name, reply.reply
        FROM
            user JOIN reply ON reply.user_id = user.user_id
        WHERE
            reply.tweet_id IN (${tweetId});`;
      const replies = await db.all(followingReplies);
      response.send(getReplyDetails(replies));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticate, async (request, response) => {
  const { user_id } = request;
  const getTweetIdsOfUser = `SELECT tweet_id FROM tweet WHERE user_id = ${user_id};`;
  const tweetIdsArray = await db.all(getTweetIdsOfUser);

  const tweetIds = tweetIdsArray.map((each) => {
    return each.tweet_id;
  });
  console.log(tweetIds);

  const getUserAllTweets = `
    SELECT
        tweet.tweet, COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
    FROM
        tweet LEFT JOIN like ON like.tweet_id = tweet.tweet_id
        LEFT JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE
        tweet.tweet_id IN (${tweetIds})
    GROUP BY
        tweet.tweet_id;`;
  const allTweets = await db.all(getUserAllTweets);
  response.send(allTweets);
});

app.post("/user/tweets/", authenticate, async (request, response) => {
  const { user_id } = request;
  const { tweet } = request.body;
  const date = new Date();
  const dateTime = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;

  const createTweetByUser = `
    INSERT INTO
        tweet(tweet, user_id, date_time)
    VALUES
        ('${tweet}', ${user_id}, '${dateTime}');`;
  await db.run(createTweetByUser);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { user_id } = request;
  const { tweetId } = request.params;
  const getTweetIdsOfUser = `SELECT tweet_id FROM tweet WHERE user_id = ${user_id};`;
  const tweetIdsArray = await db.all(getTweetIdsOfUser);

  const tweetIds = tweetIdsArray.map((each) => {
    return each.tweet_id;
  });

  if (tweetIds.includes(parseInt(tweetId))) {
    const deleteOwnTweetByUser = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteOwnTweetByUser);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
