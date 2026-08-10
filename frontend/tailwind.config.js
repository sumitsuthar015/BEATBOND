/** @type {import('tailwindcss').Config} */
import animate from "tailwindcss-animate"

export default {
    darkMode: ["class"],
    content: [
        './pages/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './app/**/*.{ts,tsx}',
        './src/**/*.{ts,tsx}',
    ],
	theme: {
    	container: {
    		center: true,
    		padding: "2rem",
    		screens: {
    			"2xl": "1400px",
    		},
    	},
    	extend: {
			keyframes: {
				"accordion-down": {
					from: { height: 0 },
					to: { height: "var(--radix-accordion-content-height)" },
				},
				"accordion-up": {
					from: { height: "var(--radix-accordion-content-height)" },
					to: { height: 0 },
				},
				wave: {
					'0%': { transform: 'translateX(-100%) translateY(10%)' },
					'50%': { transform: 'translateX(0) translateY(-10%)' },
					'100%': { transform: 'translateX(100%) translateY(10%)' }
				},
				wave2: {
					'0%': { transform: 'translateX(-100%) translateY(-10%)' },
					'50%': { transform: 'translateX(0) translateY(10%)' },
					'100%': { transform: 'translateX(100%) translateY(-10%)' }
				},
				rise: {
					'0%': { 
						transform: 'translateY(120%) scale(0)',
						opacity: 0
					},
					'50%': { 
						transform: 'translateY(60%) scale(1)',
						opacity: 1
					},
					'100%': { 
						transform: 'translateY(-20%) scale(0)',
						opacity: 0
					}
				},
				"flow-1": {
					'0%': { transform: 'translateX(-5%) translateY(0)' },
					'50%': { transform: 'translateX(5%) translateY(-2%)' },
					'100%': { transform: 'translateX(-5%) translateY(0)' }
				},
				"flow-2": {
					'0%': { transform: 'translateX(5%) translateY(-2%)' },
					'50%': { transform: 'translateX(-5%) translateY(2%)' },
					'100%': { transform: 'translateX(5%) translateY(-2%)' }
				},
				"flow-3": {
					'0%': { transform: 'translateX(-3%) translateY(2%)' },
					'50%': { transform: 'translateX(3%) translateY(-1%)' },
					'100%': { transform: 'translateX(-3%) translateY(2%)' }
				},
				"flow-4": {
					'0%': { transform: 'translateX(4%) translateY(1%)' },
					'50%': { transform: 'translateX(-4%) translateY(-2%)' },
					'100%': { transform: 'translateX(4%) translateY(1%)' }
				}
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
				"wave": "wave 8s linear infinite",
				"wave2": "wave2 10s linear infinite",
				"rise": "rise 4s ease-in infinite",
				"flow-1": "flow-1 8s ease-in-out infinite",
				"flow-2": "flow-2 9s ease-in-out infinite",
				"flow-3": "flow-3 10s ease-in-out infinite",
				"flow-4": "flow-4 11s ease-in-out infinite"
			},
			colors: {
				'custom-indigo': '#6D28D9',
				'custom-light-purple': '#D4BCE5',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				}
			},
    		borderRadius: {
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		}
    	}
    },
	plugins:[animate],
};
