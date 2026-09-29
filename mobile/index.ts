import { registerRootComponent } from "expo";
import Constants from "expo-constants";
const App =
  Constants.expoConfig?.extra?.variant === "admin"
    ? require("./src/AdminApp").default
    : require("./App").default;
registerRootComponent(App);
