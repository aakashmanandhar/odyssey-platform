import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import { CountrySoon, Soon } from "./pages/Soon";
import Destination from "./pages/Destination";

export default function App() {
  const location = useLocation();
  return (
    <Layout>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={location.pathname}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Soon title="Explore all destinations" note="Filter all 208 destinations by month, country and type. Arrives in step 5.4." />} />
            <Route path="/countries" element={<Soon title="Countries" note="Briefings for all 12 countries. Arrives in step 5.4." />} />
            <Route path="/compare" element={<Soon title="Compare destinations" note="Two or three places side by side, climate curves overlaid. Arrives in step 5.4." />} />
            <Route path="/about" element={<Soon title="How it's built" note="Data sources, freshness and model accuracy. Arrives in step 5.4." />} />
            <Route path="/d/:key" element={<Destination />} />
            <Route path="/c/:key" element={<CountrySoon />} />
            <Route path="*" element={<Soon title="Page not found" note="That address doesn't exist. Try search, or head back home." />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
