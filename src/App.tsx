import Game from './components/Game';
import ErrorBoundary from './components/ErrorBoundary';

const App = () => (
  <ErrorBoundary>
    <Game />
  </ErrorBoundary>
);

export default App;
