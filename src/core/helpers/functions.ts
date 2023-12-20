/*HELPER FUNCTIONS
    Please add your multi project focused functions in this file and use in the project from here.
*/

/**
 * Creates a random hexadecimal formatted color
 * @returns
 */
export function getRandomHexColor():string {
    // Generate random values for red, green, and blue
    const red = Math.floor(Math.random() * 256);
    const green = Math.floor(Math.random() * 256);
    const blue = Math.floor(Math.random() * 256);
  
    // Convert decimal values to hexadecimal and ensure two digits
    const redHex = red.toString(16).padStart(2, '0');
    const greenHex = green.toString(16).padStart(2, '0');
    const blueHex = blue.toString(16).padStart(2, '0');
  
    // Combine the values to create a hex color code
    const hexColor = `#${redHex}${greenHex}${blueHex}`;
  
    return hexColor;
}