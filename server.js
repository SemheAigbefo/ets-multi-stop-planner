require("dotenv").config();

const express = require("express"); //imports Express library
const cors = require("cors"); //imports cors

const stopsData =
    require("./data/processed/stopsRouteJoin.json"); //imports processed ETS stop data

const buildIndexes =
    require("./src/data/buildIndexes"); //imports function that builds stopMap and KD-tree

const getCoordinates =
    require("./src/geocode/coordFun"); //imports geocoding function

const {
    nearest
} = require("./src/spatial/nearestStop"); //imports KD-tree nearest-stop function

const getRoutesByStop =
    require("./src/routes/getRouteByStop");


const app = express(); //instance of Express application

const PORT = 3000; // where the server will run, follow industry standards, should not be hardcoded


// Allow Express to read JSON sent by fetch()
app.use(cors());
app.use(express.json()); //middleware that tells Exp serv to read and parse incoming data


/*
 * Build indexes once when the server starts.
 *
 * stopMap:
 *      stop name → stop information
 *
 * kdTree:
 *      coordinates → nearby ETS stops
 *
 * We build these once instead of rebuilding them
 * every time a user submits the form.
 */
const {
    stopMap,
    kdTree
} = buildIndexes(stopsData);


/*
 * POST /api/route
 *
 * Receives the user's stops and departure time
 * from the frontend.
 */
app.post("/api/route", async (req, res) => {

    const {
        stops,
        departureTime
    } = req.body; //object destructuring; extract properties stops and departureTime from request


    console.log("Stops:", stops);
    console.log("Departure time:", departureTime);


    try {

        // Stores the processed information for each user stop
        const results = [];


        /*
         * Process every stop submitted by the user.
         */
        for (const stop of stops) {

            /*
             * First try to find the user's input in our
             * existing ETS stop map.
             *
             * If it isn't an ETS stop, coordFun.js
             * will use Google Geocoding to find coordinates.
             */
            const coordinates =
                await getCoordinates(
                    stop.name,
                    stopMap
                );


            /*
             * Use the coordinates to search the KD-tree
             * for the geographically nearest ETS stop.
             */
            const nearestResult =
                nearest(
                    kdTree,
                    coordinates.lat,
                    coordinates.lon
                );

            const routes =
    getRoutesByStop(nearestResult.stop);


            /*
             * Store all relevant information so it can
             * eventually be sent back to the frontend.
             */
            results.push({
                input: stop.name,

                coordinates: coordinates,

                nearestStop: nearestResult.stop,

                routes : routes,
                // Internal KD-tree distance.
                // This is NOT walking distance.
                kdDistance: nearestResult.distance
            });
        }


        /*
         * Send the processed route information back
         * to the frontend / user's browser.
         */
        res.json({
            success: true,
            departureTime: departureTime,
            stops: results
        });

    } catch (error) {

        console.error(
            "Error processing route:",
            error
        );

        res.status(500).json({
            success: false,
            error: "Failed to process route"
        });
    }
});


app.listen(PORT, () => { //starts web server at port and listens for traffic

    console.log(
        `Server running on http://localhost:${PORT}`
    );

});