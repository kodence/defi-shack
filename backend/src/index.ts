import express from "express";
import cors from "cors";
import { PORT } from "./constants";
import poolsRouter from "./routes/pools";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/pools", poolsRouter);

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
