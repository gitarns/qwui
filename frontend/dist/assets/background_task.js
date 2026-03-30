var _excluded = ["title", "titleId"];
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], t.indexOf(o) >= 0 || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.indexOf(n) >= 0) continue; t[n] = r[n]; } return t; }
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

// THIS IS A GENERATED FILE. DO NOT MODIFY MANUALLY. @see scripts/compile-icons.js

import * as React from 'react';
import { jsx as ___EmotionJSX } from "@emotion/react";
var EuiIconBackgroundTask = function EuiIconBackgroundTask(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    d: "M11.157 9.013a1.004 1.004 0 0 1 .373.14l4 2.5a1 1 0 0 1 0 1.695l-4 2.5A1 1 0 0 1 10 15v-5l.009-.135a1 1 0 0 1 .407-.677l.1-.063a1 1 0 0 1 .641-.112ZM11 15l4-2.5-1.122-.702-.849-.53L11 10v5ZM6.45 13.794a5.99 5.99 0 0 0 1.55.205v1a6.993 6.993 0 0 1-1.81-.24l.26-.965Zm-2.692-1.552c.373.373.792.692 1.243.952l-.5.866a6.99 6.99 0 0 1-1.45-1.11l.707-.708ZM2.205 9.55a6.06 6.06 0 0 0 .6 1.449l-.433.249-.433.25a7.07 7.07 0 0 1-.7-1.688l.483-.13.483-.13ZM8.001.999a7 7 0 0 1 7 7c0 .683-.1 1.342-.284 1.966l-.887-.555a5.97 5.97 0 0 0 .171-1.411 6 6 0 0 0-6-6v-1ZM2.805 4.997A6.013 6.013 0 0 0 2 7.998L1.001 8a7.022 7.022 0 0 1 .937-3.502l.867.5ZM6.45 2.201a6.036 6.036 0 0 0-2.692 1.554L3.405 3.4l-.353-.353a7.036 7.036 0 0 1 3.137-1.812l.26.966Z"
  }));
};
export var icon = EuiIconBackgroundTask;