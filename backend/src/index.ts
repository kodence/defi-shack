import express from "express";
import cors from "cors";
import { PORT } from "./constants";
import poolsRouter from "./routes/pools";
import simulatorRouter from "./routes/simulator";
import trackRouter from "./routes/track";
import pricesRouter from "./routes/prices";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/pools", poolsRouter);
app.use("/api/simulator", simulatorRouter);
app.use("/api/track", trackRouter);
app.use("/api/prices", pricesRouter);

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
