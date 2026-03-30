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
var EuiIconEraser = function EuiIconEraser(_ref) {
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
    d: "m2.648 9.937 7.29-7.288a2.21 2.21 0 0 1 3.124 0l2.29 2.288a2.21 2.21 0 0 1 0 3.126L10.413 13H12.5a.5.5 0 0 1 0 1H4.501a2.21 2.21 0 0 1-1.563-.647l.707-.707c.227.226.535.354.856.354h4.005a1.21 1.21 0 0 0 .848-.354l1.292-1.293-4-4-3.29 3.291a1.21 1.21 0 0 0 0 1.712l.29.29-.708.707-.29-.29a2.21 2.21 0 0 1 0-3.126zM8 6h6.89a1.208 1.208 0 0 0-.246-.356L14 5H9L8 6zm2-2h3l-.645-.644a1.21 1.21 0 0 0-1.71 0L10 4zm4.89 3H7.708l1 1H14l.644-.644A1.22 1.22 0 0 0 14.891 7zM9.708 9l1.646 1.646L13 9H9.707z"
  }), ___EmotionJSX("path", {
    d: "M14 11.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm1.5-.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm-1 2a.5.5 0 0 0 0 1h1a.5.5 0 0 0 0-1h-1z"
  }));
};
export var icon = EuiIconEraser;