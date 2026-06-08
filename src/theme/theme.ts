import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "rgb(33, 150, 243)",
      light: "rgb(100, 181, 246)",
      dark: "rgb(25, 118, 210)",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#475569", // Slate 600
      light: "#64748b",
      dark: "#1e293b",
      contrastText: "#ffffff",
    },
    background: {
      default: "#fefefe", // Slate 50
      paper: "#ffffff",
    },
    text: {
      primary: "#0f172a", // Slate 900
      secondary: "#64748b", // Slate 500
      disabled: "#94a3b8",
    },
    divider: "#e2e8f0", // Slate 200
  },
  typography: {
    fontFamily: [
      "Roboto",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Arial",
      "sans-serif",
    ].join(","),
    h1: {
      fontWeight: 700,
      color: "#0f172a",
    },
    h2: {
      fontWeight: 700,
      color: "#0f172a",
    },
    h3: {
      fontWeight: 600,
      color: "#0f172a",
    },
    h4: {
      fontWeight: 600,
      fontSize: "22px",
      letterSpacing: "-0.5px",
      color: "#0f172a",
    },
    h5: {
      fontWeight: 600,
      fontSize: "18px",
      color: "#0f172a",
    },
    h6: {
      fontWeight: 600,
      fontSize: "16px",
      color: "#0f172a",
    },
    subtitle1: {
      fontSize: "15px",
      color: "#64748b",
    },
    subtitle2: {
      fontWeight: 600,
      fontSize: "14px",
      color: "#64748b",
    },
    body1: {
      fontSize: "14px",
      color: "#0f172a",
    },
    body2: {
      fontSize: "13px",
      color: "#475569",
    },
    caption: {
      fontSize: "10px",
      color: "#64748b",
    },
    overline: {
      fontSize: "9px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: "#94a3b8",
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          color: "#64748b",
          fontSize: "12px",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          borderRadius: 8,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
        outlined: {
          borderColor: "#e2e8f0",
          color: "#475569",
          "&:hover": {
            backgroundColor: "#f8fafc",
            borderColor: "#cbd5e1",
          },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: 3,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          border: "none",
          borderRadius: 8,
          padding: "6px 16px",
          fontWeight: 500,
          color: "#64748b",
          "&.Mui-selected": {
            backgroundColor: "#ffffff",
            color: "#0f172a",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
            fontWeight: 600,
            "&:hover": {
              backgroundColor: "#ffffff",
            },
          },
          "&:hover": {
            backgroundColor: "rgba(100, 116, 139, 0.04)",
          },
          "&:not(:first-of-type)": {
            borderLeft: "none",
          },
          "&.Mui-disabled": {
            border: "none",
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: "#ffffff",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          borderColor: "#e2e8f0",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#e2e8f0",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#cbd5e1",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#0f172a",
            borderWidth: 1.5,
          },
        },
      },
    },
  },
});
