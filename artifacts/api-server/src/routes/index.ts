import { Router, type IRouter } from "express";
import healthRouter from "./health";
import healthCentresInventoryRouter from "./health-centres-inventory";
import healthOperationsRouter from "./health-operations";
import healthInsightsRouter from "./health-insights";
import { requireAuth } from "../middlewares/auth";
import { rateLimit } from "../middlewares/rate-limit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(rateLimit);
router.use(healthCentresInventoryRouter);
router.use(healthOperationsRouter);
router.use(healthInsightsRouter);

export default router;
