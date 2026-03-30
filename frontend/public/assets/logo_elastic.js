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
var EuiIconLogoElastic = function EuiIconLogoElastic(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 32,
    height: 32,
    fill: "none",
    "data-type": "logoElastic",
    viewBox: "0 0 32 32",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    fill: "#0B64DD",
    stroke: "#fff",
    strokeWidth: 1.2,
    d: "M27.565 11.242c5.1 1.94 4.872 9.396-.245 11.127l-.162.055-.167-.039-5.28-1.238-.268-.063-.127-.244-1.4-2.69-.217-.417.352-.31 6.904-6.07.272-.24.338.13Z"
  }), ___EmotionJSX("path", {
    fill: "#9ADC30",
    stroke: "#fff",
    strokeWidth: 1.2,
    d: "m22.047 21.239 4.8 1.125.316.074.11.304.066.19c.623 1.964-.26 3.78-1.652 4.797-1.434 1.048-3.51 1.32-5.182.022l-.29-.225.069-.361 1.037-5.454.117-.615.61.143Z"
  }), ___EmotionJSX("path", {
    fill: "#1BA9F5",
    stroke: "#fff",
    strokeWidth: 1.2,
    d: "m5.01 9.63 5.267 1.255.283.067.122.264 1.235 2.65.187.4-.328.298-6.733 6.1-.272.248-.345-.132C1.939 19.83.72 17.456.752 15.153c.032-2.308 1.321-4.644 3.932-5.508l.162-.054.165.039Z"
  }), ___EmotionJSX("path", {
    fill: "#F04E98",
    stroke: "#fff",
    strokeWidth: 1.2,
    d: "M6.281 4.32c1.416-1.08 3.48-1.387 5.222-.069l.297.226-.07.366-1.053 5.474-.118.615-.609-.144-4.8-1.137-.316-.075-.11-.306c-.709-1.967.149-3.876 1.557-4.95Z"
  }), ___EmotionJSX("path", {
    fill: "#02BCB7",
    stroke: "#fff",
    strokeWidth: 1.2,
    d: "m12.466 14.433 7.03 3.211.188.086.095.183 1.555 2.985.096.184-.04.206-1.165 6.101-.024.122-.068.103c-2.68 3.958-6.902 4.71-10.268 3.26-3.356-1.447-5.834-5.07-5.126-9.736l.033-.21.158-.144 6.884-6.25.293-.265.36.164Z"
  }), ___EmotionJSX("path", {
    fill: "#FEC514",
    stroke: "#fff",
    strokeWidth: 1.2,
    d: "M11.892 4.41C14.438.676 18.741.105 22.134 1.54c3.392 1.433 5.99 4.92 5.102 9.362l-.039.2-.153.133-7.066 6.213-.293.258-.353-.163-7.002-3.21-.201-.093-.094-.2-1.38-2.988-.081-.177.037-.19L11.8 4.633l.023-.121.07-.102Z"
  }));
};
export var icon = EuiIconLogoElastic;