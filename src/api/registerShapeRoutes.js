const { trimShapeToStops } = require("../routing/shapeGeometry");


function registerShapeRoutes({ app, tripById, shapePointsById, stopById }) {
    app.get("/api/trips/:tripId/shape", (req, res) => {
        const trip = tripById.get(String(req.params.tripId));
        const fromStop = stopById.get(String(req.query.fromStopId || ""));
        const toStop = stopById.get(String(req.query.toStopId || ""));
        const fullShape = trip?.shapeId
            ? shapePointsById.get(String(trip.shapeId))
            : null;
        const points = trimShapeToStops(fullShape, fromStop, toStop);

        if (!trip || !fullShape || points.length < 2) {
            return res.status(404).json({
                success: false,
                error: "Shape geometry is unavailable for this transit segment."
            });
        }

        res.json({
            success: true,
            tripId: trip.tripId,
            shapeId: trip.shapeId,
            points
        });
    });
}


module.exports = registerShapeRoutes;
