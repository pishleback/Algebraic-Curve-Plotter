/*
  tags: instancing, basic
  <p> In this example, it is shown how you can draw a bunch of bunny meshes using the
  instancing feature of regl. </p>
*/

//const mat4 = require('gl-mat4')
//const bunny = require('bunny')
//const fit = require('canvas-fit')
//const normals = require('angle-normals')

const regl_module = require('regl')

window.run_canvas = function (canvas, curves_glsl) {
	const regl = regl_module({canvas: canvas, extensions: ['angle_instanced_arrays']})
	//const camera = require('canvas-orbit-camera')(canvas)
	//window.addEventListener('resize', fit(canvas), false)


	class Camera {
		constructor(center, zoom) {
			this.center = center;
			this.zoom = zoom;
		}
		
		coord_to_pixels(coord) {
			return [(canvas.width / 2) + (coord[0] - this.center[0]) * this.zoom, 
				    (canvas.height / 2) - (coord[1] - this.center[1]) * this.zoom];
		}
		
		pixels_to_coord(pixels) {
			return [(pixels[0] - (canvas.width / 2)) / this.zoom + this.center[0], 
			        ((canvas.height / 2) - pixels[1]) / this.zoom + this.center[1]];
		}
	}

	function getMousePos(canvas, evt) {  
	  const bb = canvas.getBoundingClientRect();
	  const x = Math.floor( (event.clientX - bb.left) / bb.width * canvas.width );
	  const y = Math.floor( (event.clientY - bb.top) / bb.height * canvas.height );
	  return [x, y];
	}



	canvas.onclick = function (event) {
		mouse_pos = getMousePos(canvas, event)
		console.log(mouse_pos);
		console.log(camera.pixels_to_coord(mouse_pos));
		console.log(camera.coord_to_pixels(camera.pixels_to_coord(mouse_pos)));
	}

	canvas.onmousewheel = function(event){
		event.preventDefault();
	};

	canvas.onwheel = function (event) {
		event.preventDefault();	
		at_mouse_before = camera.pixels_to_coord(getMousePos(canvas, event))
		camera.zoom *= Math.pow(1.001, -event.deltaY);
		if (camera.zoom < 0.1) {
			camera.zoom = 0.1;
		} else if (camera.zoom > 10000) {
			camera.zoom = 10000;
		}
		console.log(camera.zoom);
		at_mouse_after = camera.pixels_to_coord(getMousePos(canvas, event));
		camera.center[0] += at_mouse_after[0] - at_mouse_before[0];
		camera.center[1] += at_mouse_after[1] - at_mouse_before[1];
	}

	camera = new Camera([0.000001, 0.000001], 200); //offset center to prevent glsl artifacts on grid lines
	
	
	
	const draw = regl({
	  vert: `
	  attribute vec2 u_pos;
	  
	  varying highp vec2 coord;
	  uniform vec2 canvas_size;
	  uniform vec2 center_coord;
	  uniform highp float zoom;

	  void main () {
		gl_Position = vec4(u_pos, 0, 1);
		coord = (canvas_size*u_pos/2.0)/zoom-center_coord;
	  }`,
	  
	  frag: `
	  varying highp vec2 coord;
	  uniform highp float zoom;
	  
	  highp float cosh(highp float x) {
		return (exp(x) + exp(-x)) / 2.0;
	  }
	  
	  highp float sinh(highp float x) {
		return (exp(x) - exp(-x)) / 2.0;
	  }
	  
	  highp float tanh(highp float x) {
		return sinh(x) / cosh(x);
	  }
	  
	  void main () {
		if (abs(mod(coord.x + 0.5, 1.0) - 0.5) < 0.5/zoom || abs(mod(coord.y + 0.5, 1.0) - 0.5) < 0.5/zoom) {
			highp float val = 1.0 - max(tanh(log(zoom) / 6.0), 0.0);
			gl_FragColor = vec4(val, val, val, 1);
		} else {
			gl_FragColor = vec4(1, 1, 1, 1);
		}
	  }`,

	  attributes: {
		u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
	  },
	  
	  uniforms: {
		canvas_size: [canvas.width, canvas.height],
		zoom: regl.prop('zoom'),
		center_coord: regl.prop('center')
	  },
	  
	  depth: {
		  enable: false
	  },

	  count: 6
	})
	
	
	draw_curves = [];
	for (var i = 0; i < curves_glsl.length; i++) {
		draw_curves.push(regl({
		  vert: `
		  attribute vec2 u_pos;
		  
		  varying highp vec2 coord;
		  uniform vec2 canvas_size;
		  uniform vec2 center_coord;
		  uniform highp float zoom;

		  void main () {
			gl_Position = vec4(u_pos, 0, 1);
			coord = (canvas_size*u_pos/2.0)/zoom-center_coord;
		  }`,
		  
		  frag: `
		  varying highp vec2 coord;
		  uniform highp float zoom;
		  
		  highp float func(highp float x, highp float y, highp float z) {
			  return ` + curves_glsl[i] + `;
		  }
		  
		  highp float pi = 3.14159265359;
		  
		  void main () {
			int neg_count = 0;
			highp float a;
			for (int i = 0; i < 5; i++) {
				a = pi*float(i)/2.5;
				if (func(coord.x + 2.5 * sin(a) / zoom, coord.y + 2.5 * cos(a) / zoom, 1.0) < 0.0) {
					neg_count += 1;
				}
			}
			  
			if (neg_count == 0 || neg_count == 5) {
				discard;
			} else {
				gl_FragColor = vec4(1, 0, 0, 1);
			}
		  }`,

		  attributes: {
			u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
		  },
		  
		  uniforms: {
			canvas_size: [canvas.width, canvas.height],
			zoom: regl.prop('zoom'),
			center_coord: regl.prop('center')
		  },
		  
		  depth: {
			  enable: false
		  },

		  count: 6
		}))
	}

	regl.frame(function () { 
	  regl.clear({
		color: [1, 1, 1, 1]
	  })
	  
	  draw({
		  zoom : camera.zoom,
		  center : camera.center
	  })
	  
	  for (var i = 0; i < draw_curves.length; i++) {
		  draw_curves[i]({
			  zoom : camera.zoom,
			  center : camera.center
		  })
	  }
	})
}


var Quaternion = require('quaternion');


window.run_canvas_sphere = function (canvas, curves_glsl) {
	const regl = regl_module({canvas: canvas, extensions: ['angle_instanced_arrays']})
	//const camera = require('canvas-orbit-camera')(canvas)
	//window.addEventListener('resize', fit(canvas), false)
	
	var angle = Quaternion(1, 0, 0, 0);	//represent the rotation of the projective plane using a unit quaternion
	
	addEventListener('mousemove', (event) => {
		if (event.target == canvas && (event.buttons & 1)) { //click and drag within the canvas	
			//idk why i=y and j=x but thats just how it do be
			di = Math.tanh(event.movementY / 100)/2	
			dj = Math.tanh(event.movementX / 100)/2
			dk = 0
			dr = Math.sqrt(1-di*di-dj*dj-dk*dk);
			d_angle = Quaternion(dr, di, dj, dk);
			angle = d_angle.mul(angle);
			angle = angle.normalize();		
		}
	})
	
	draw_sphere = regl({
	  vert: `
	  attribute vec2 u_pos;
	  varying highp vec2 pos;
	  
	  void main () {
		pos = u_pos;
		gl_Position = vec4(u_pos, 0, 1);
	  }`,
	  
	  frag: `	  
	  varying highp vec2 pos;
	  uniform highp mat3 angle;
	  
	  void main () {
		if (pos.x*pos.x + pos.y*pos.y < 1.0) {
			highp vec3 s_pos = vec3(pos.x, pos.y, sqrt(1.0 - pos.x*pos.x - pos.y*pos.y));
			
			s_pos = angle * s_pos;
			
			if ((abs(mod(s_pos.x / s_pos.z + 0.5, 1.0) - 0.5) < 0.005 / abs(s_pos.z)) || (abs(mod(s_pos.y / s_pos.z + 0.5, 1.0) - 0.5) < 0.005 / abs(s_pos.z))) {
				gl_FragColor = vec4(0.8, 0.8, 0.8, 1);
			} else {
				gl_FragColor = vec4(1, 1, 1, 1);
			}
			
		} else {
			discard;
		}
	  }`,

	  attributes: {
		u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
	  },
	  
	  uniforms: {
		canvas_size: [canvas.width, canvas.height],
		angle: regl.prop('angle'),
	  },
	  
	  depth: {
		  enable: false
	  },

	  count: 6
	})
	
	drawers = [];
	for (var i = 0; i < curves_glsl.length; i++) {
		drawers.push(regl({
				vert: `
				attribute vec2 u_pos;
				varying highp vec2 pos;

				void main () {
				pos = u_pos;
				gl_Position = vec4(u_pos, 0, 1);
				}`,

				frag: `	  
				varying highp vec2 pos;
				uniform highp mat3 angle;

				highp float pi = 3.14159265359;

				highp float func(highp vec3 v) {
				  highp float x = v.x;
				  highp float y = v.y;
				  highp float z = v.z;
				  return ` + curves_glsl[i] + `;
				}

				highp vec3 get_perp(highp vec3 v) {
				  if (v.z < 0.5) {
						return normalize(cross(v, vec3(0.0, 0.0, 1.0)));
				  } else {
					  return normalize(cross(v, vec3(0.0, 1.0, 0.0)));
				  }
				}

				void main () {
				if (pos.x*pos.x + pos.y*pos.y < 1.0) {
					highp vec3 s_pos = vec3(pos.x, pos.y, sqrt(1.0 - pos.x*pos.x - pos.y*pos.y));
					
					s_pos = angle * s_pos;
					
					int count = 0;
					if (s_pos.x < 0.0) {
						count += 1;
					}
					if (s_pos.y < 0.0) {
						count += 1;
					}
					if (s_pos.z < 0.0) {
						count += 1;
					}
					
					highp vec3 S = get_perp(s_pos);
					highp vec3 T = cross(S, s_pos);
					
					int neg_count = 0;
					highp float a;
					for (int i = 0; i < 5; i++) {
						a = pi*float(i)/2.5;
						if (func(s_pos + cos(a) * S / 150.0 + sin(a) * T / 150.0) < 0.0) {
							neg_count += 1;
						}
					}
					
					if (neg_count == 0 || neg_count == 5) {
						discard;
					} else {
						gl_FragColor = vec4(1, 0, 0, 1);
					}
					
				} else {
					discard;
				}
			}`,

			attributes: {
			u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
			},

			uniforms: {
			canvas_size: [canvas.width, canvas.height],
			angle: regl.prop('angle'),
			},

			depth: {
			  enable: false
			},

			count: 6
		}))
	}
	

	regl.frame(function () { 
		regl.clear({
			color: [0, 0, 0, 0]
		})
  
		draw_sphere({
			angle : angle.toMatrix()
		})

		for (var i = 0; i < draw_curves.length; i++) {
			drawers[i]({
				angle : angle.toMatrix()
			})
		}
	})
}