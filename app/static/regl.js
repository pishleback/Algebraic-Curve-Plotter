/*
  tags: instancing, basic
  <p> In this example, it is shown how you can draw a bunch of bunny meshes using the
  instancing feature of regl. </p>
*/

//const mat4 = require('gl-mat4')
//const bunny = require('bunny')
//const fit = require('canvas-fit')
//const normals = require('angle-normals')

const regl_module = require('regl');
const fs = require('fs');



window.AffineCanvas = class {
	constructor(canvas) {
		const affine_canvas = this;
		this.canvas = canvas;
		this.regl = regl_module({canvas: canvas, extensions: ['angle_instanced_arrays']})
		this.center = [0.000001, 0.000001]; //offset center to prevent glsl artifacts on grid lines
		this.zoom = 200;
		
		this.draw_curves = [];
		
		this.canvas.onclick = function (event) {
			var mouse_pos = affine_canvas.getMousePos(affine_canvas.canvas, event)
			console.log(mouse_pos);
			console.log(affine_canvas.pixels_to_coord(mouse_pos));
			console.log(affine_canvas.coord_to_pixels(affine_canvas.pixels_to_coord(mouse_pos)));
		}

		this.canvas.onmousewheel = function(event){
			event.preventDefault();
		};

		this.canvas.onwheel = function (event) {
			event.preventDefault();	
			var at_mouse_before = affine_canvas.pixels_to_coord(affine_canvas.getMousePos(affine_canvas.canvas, event))
			affine_canvas.zoom *= Math.pow(1.001, -event.deltaY);
			if (affine_canvas.zoom < 0.1) {
				affine_canvas.zoom = 0.1;
			} else if (affine_canvas.zoom > 10000) {
				affine_canvas.zoom = 10000;
			}
			var at_mouse_after = affine_canvas.pixels_to_coord(affine_canvas.getMousePos(affine_canvas.canvas, event));
			affine_canvas.center[0] += at_mouse_after[0] - at_mouse_before[0];
			affine_canvas.center[1] += at_mouse_after[1] - at_mouse_before[1];
		}
		
		var draw_grid = this.regl({
				vert: `
				attribute vec2 u_pos;

				varying highp vec2 coord;
				uniform vec2 canvas_size;
				uniform vec2 center;
				uniform highp float zoom;

				void main () {
				gl_Position = vec4(u_pos, 0, 1);
				coord = (canvas_size*u_pos/2.0)/zoom-center;
				}`,

				frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `
				varying highp vec2 coord;
				uniform highp float zoom;

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
			zoom: this.regl.prop('zoom'),
			center: this.regl.prop('center')
		  },
		  
		  depth: {
			  enable: false
		  },

		  count: 6
		})
		

		this.regl.frame(function () {
			affine_canvas.regl.clear({
				color: [0, 0, 0, 0]
			})
				  
			draw_grid({
				zoom : affine_canvas.zoom,
				center : affine_canvas.center,
			})
			
			for (var i = 0; i < affine_canvas.draw_curves.length; i++) {
				affine_canvas.draw_curves[i]({
					zoom : affine_canvas.zoom,
					center : affine_canvas.center
				})
			}
		})
	
	}
	
	coord_to_pixels(coord) {
		return [(this.canvas.width / 2) + (coord[0] - this.center[0]) * this.zoom, 
		        (this.canvas.height / 2) - (coord[1] - this.center[1]) * this.zoom];
	}
	
	pixels_to_coord(pixels) {
		return [(pixels[0] - (this.canvas.width / 2)) / this.zoom + this.center[0], 
			    ((this.canvas.height / 2) - pixels[1]) / this.zoom + this.center[1]];
	}
	
	getMousePos(evt) {  
		const bb = this.canvas.getBoundingClientRect();
		const x = Math.floor( (event.clientX - bb.left) / bb.width * this.canvas.width );
		const y = Math.floor( (event.clientY - bb.top) / bb.height * this.canvas.height );
		return [x, y];
	}
	
	update_curves (curves_glsl) {		
		this.draw_curves = [];
		for (var i = 0; i < curves_glsl.length; i++) {
			this.draw_curves.push(this.regl({
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

				frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `
				varying highp vec2 coord;
				uniform highp float zoom;

				highp float func(highp float x, highp float y, highp float z) {
					return ` + curves_glsl[i] + `;
				}

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
					canvas_size: [this.canvas.width, this.canvas.height],
					zoom: this.regl.prop('zoom'),
					center_coord: this.regl.prop('center')
				},

				depth: {
					enable: false
				},

				count: 6
			}))
		}
	}
}

window.ProjectiveCanvas = class {
	constructor(canvas) {
		const projective_canvas = this;
		this.canvas = canvas;
		this.regl = regl_module({canvas: canvas, extensions: ['angle_instanced_arrays']})
		var Quaternion = require('quaternion');
		this.angle = Quaternion(1, 0, 0, 0);	//represent the rotation of the projective plane using a unit quaternion
		
		this.draw_curves = [];
		
		addEventListener('mousemove', (event) => {
			if (event.target == canvas && (event.buttons & 1)) { //click and drag within the canvas	
				//idk why i=y and j=x but thats just how it do be
				var di = Math.tanh(event.movementY / 100)/2;
				var dj = Math.tanh(event.movementX / 100)/2;
				var dk = 0;
				var dr = Math.sqrt(1-di*di-dj*dj-dk*dk);
				var d_angle = Quaternion(dr, di, dj, dk);
				projective_canvas.angle = d_angle.mul(projective_canvas.angle);
				projective_canvas.angle = projective_canvas.angle.normalize();		
			}
		})
	
		var draw_grid = this.regl({
			vert: `
			attribute vec2 u_pos;
			varying highp vec2 pos;
		  
			void main () {
				pos = u_pos;
				gl_Position = vec4(u_pos, 0, 1);
			}`,
		  
			frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `
			varying highp vec2 pos;
			uniform highp mat3 angle;
		  
			void main () {
				highp vec3 s_pos = circle_to_pp_stereographic(pos);
				if (s_pos.x == 0.0 && s_pos.y == 0.0 && s_pos.z == 0.0) {
					discard;
				}
			
				s_pos = angle * s_pos;
			
				if ((abs(mod(s_pos.x / s_pos.z + 0.5, 1.0) - 0.5) < 0.003 / abs(s_pos.z)) || (abs(mod(s_pos.y / s_pos.z + 0.5, 1.0) - 0.5) < 0.003 / abs(s_pos.z))) {
					highp float val = 1.0-0.8*abs(s_pos.z);
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
				angle: this.regl.prop('angle'),
			},
		  
			depth: {
				enable: false
			},

			count: 6
		})

		this.regl.frame(function () {
			projective_canvas.regl.clear({
				color: [0, 0, 0, 0]
			})
				  
			draw_grid({
				angle : projective_canvas.angle.toMatrix(),
			})
			
			for (var i = 0; i < projective_canvas.draw_curves.length; i++) {
				projective_canvas.draw_curves[i]({
					angle : projective_canvas.angle.toMatrix()
				})
			}
		})
	}
	
	update_curves (curves_glsl) {		
		this.draw_curves = [];
		for (var i = 0; i < curves_glsl.length; i++) {
			this.draw_curves.push(this.regl({
					vert: `
					attribute vec2 u_pos;
					varying highp vec2 pos;

					void main () {
					pos = u_pos;
					gl_Position = vec4(u_pos, 0, 1);
					}`,

					frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `
					varying highp vec2 pos;
					uniform highp mat3 angle;

					highp float func(highp vec3 v) {
					  highp float x = v.x;
					  highp float y = v.y;
					  highp float z = v.z;
					  return ` + curves_glsl[i] + `;
					}

					void main () {
					highp vec3 s_pos = circle_to_pp_stereographic(pos);
					if (s_pos.x == 0.0 && s_pos.y == 0.0 && s_pos.z == 0.0) {
						discard;
					}
					
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
						
				}`,

				attributes: {
				u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
				},

				uniforms: {
				canvas_size: [this.canvas.width, this.canvas.height],
				angle: this.regl.prop('angle'),
				},

				depth: {
				  enable: false
				},

				count: 6
			}))
		}
	}
}