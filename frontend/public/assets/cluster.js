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
var EuiIconCluster = function EuiIconCluster(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    fill: "none",
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M4.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0-6a3.5 3.5 0 0 1 3.465 3h3.12a1.5 1.5 0 1 1 0 1h-3.12a3.482 3.482 0 0 1-.662 1.596l2.1 2.1A3.5 3.5 0 1 1 8.036 12h-3.12a1.5 1.5 0 1 1 0-.999h3.12a3.482 3.482 0 0 1 .662-1.596l-2.1-2.1A3.5 3.5 0 1 1 4.5 1zM12 4.5a.5.5 0 1 0 1 0 .5.5 0 0 0-1 0zm-.5 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM4 11.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0z",
    clipRule: "evenodd"
  }));
};
export var icon = EuiIconCluster;