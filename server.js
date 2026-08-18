const express = require("express"); //imports Express library
const cors = require("cors")//imports cors
const app = express(); //instance of Express application
const PORT = 3000; // where the server will run, follow industry standards, should not be harcoded
// Allow Express to read JSON sent by fetch()
app.use(cors());
app.use(express.json()); //middleware that tells Exp serv to read and parse incoming data
app.post("/api/route", (req, res) => {
    const { stops, departureTime } = req.body; //object destructuring;extract properties stops and departureTime
                                                // from request
    console.log("Stops:", stops);
    console.log("Departure time:", departureTime);
    res.json({ //send response backn to frontend /user/browser
        success: true,
        stops,
        departureTime
    });
});
app.listen(PORT, () => {  //starts web server at port and listens for traffic
    console.log(`Server running on http://localhost:${PORT}`);
});